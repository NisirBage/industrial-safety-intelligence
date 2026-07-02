"""Simulation runner - the only place a scenario touches the database.

Exists as the use-case layer wiring: it validates a scenario's
references against real data, calls the pure functions in
``src/domain/simulation/generator.py`` to compute what to write, and
persists the result exclusively through M1's repositories - never a
raw session or SQL, per the repository-isolation rule established in
M1. This is the concrete implementation of Part C's
``services/simulation_runner.py`` placeholder from M0.

M5's Orchestrator and M3's agents don't call this directly; they read
what it wrote via the same repositories. The only thing later
milestones invoke here is ``run_scenario`` itself (M5's golden-scenario
regression test replays the authored demo scenario end to end).

System Integration Layer addition: permit baseline snapshots are now
computed for real (see ``_compute_baseline_snapshot``) instead of the
previous ``{}`` placeholder, using Gas Risk Agent's own frozen, pure
``calculate_risk``/``calculate_confidence`` functions directly - this
consumes the frozen algorithm, it does not modify or reimplement it,
the same relationship every context builder in
``src/services/context_builders.py`` has with the agent it serves.
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from src.domain.agents.gas_risk import (
    GasReading,
    GasRiskConfig,
    calculate_confidence,
    calculate_risk,
)
from src.domain.simulation.generator import (
    GeneratedReading,
    generate_permits,
    generate_sensor_readings,
)
from src.domain.simulation.ids import resolve_id
from src.domain.simulation.scenario import (
    Scenario,
    ScenarioValidationError,
    load_scenario,
    validate_structure,
)
from src.infra.db.models.permit import Permit
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import (
    PermitRepository,
    SensorReadingRepository,
    SensorRepository,
    WorkerRepository,
    ZoneRepository,
)
from src.infra.db.session import get_session

logger = logging.getLogger(__name__)


def validate_references(scenario: Scenario, session: Session) -> None:
    """Confirm every zone/sensor/worker a scenario refers to actually exists.

    Separate from src/domain/simulation/scenario.py's structural
    validation because this needs repository reads, which the domain
    layer (zero I/O) isn't allowed to perform.
    """
    zones = ZoneRepository(session)
    sensors = SensorRepository(session)
    workers = WorkerRepository(session)

    for sensor_event in scenario.sensor_events:
        zone_id = resolve_id(sensor_event.zone_key)
        if zones.get(zone_id) is None:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: unknown zone {sensor_event.zone_key!r}"
            )
        if sensors.get_by_zone_and_gas(zone_id, sensor_event.gas_type) is None:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: no sensor for zone={sensor_event.zone_key!r} "
                f"gas_type={sensor_event.gas_type!r}"
            )

    for permit_event in scenario.permit_events:
        zone_id = resolve_id(permit_event.zone_key)
        if zones.get(zone_id) is None:
            raise ScenarioValidationError(
                f"event {permit_event.name!r}: unknown zone {permit_event.zone_key!r}"
            )
        if workers.get(resolve_id(permit_event.authorizing_officer_key)) is None:
            raise ScenarioValidationError(
                f"event {permit_event.name!r}: unknown authorizing officer "
                f"{permit_event.authorizing_officer_key!r}"
            )


def _resolve_zone_gas_type(scenario: Scenario, zone_key: str) -> str | None:
    """Which gas type a zone's baseline should be computed against.

    Scenario files (and today's seed data) associate at most one gas
    type per zone - the same assumption
    ``SensorRepository.get_by_zone_and_gas``'s own docstring already
    states. The first matching ``sensor_events`` entry for this zone
    is used; ``None`` means this zone has no monitored gas at all in
    this scenario, a genuinely different case from "monitored but no
    readings yet" (handled in ``_compute_baseline_snapshot`` below).
    """
    for event in scenario.sensor_events:
        if event.zone_key == zone_key:
            return event.gas_type
    return None


def _compute_baseline_snapshot(
    zone_key: str,
    issued_at: datetime,
    scenario: Scenario,
    readings: Sequence[GeneratedReading],
    zone_id: uuid.UUID,
    sensor_repo: SensorRepository,
    zone_repo: ZoneRepository,
) -> dict[str, object]:
    """A real ``PermitBaselineSnapshot``-shaped dict captured at
    issuance, replacing the previous ``{}`` placeholder (System
    Integration Layer, approved decision 2).

    Calls Gas Risk Agent's own frozen, pure ``calculate_risk``/
    ``calculate_confidence`` directly against this zone's
    already-generated readings up to ``issued_at`` - the same
    algorithm the real agent runs later, not a reimplementation of it.
    A zone with no monitored gas type at all in this scenario gets the
    same "no data" treatment ``calculate_risk``/``calculate_confidence``
    already give an empty reading list, so this never fabricates a
    number the frozen agent wouldn't also produce for the same input.
    """
    config = GasRiskConfig()
    zone = zone_repo.get(zone_id)
    elevated_floor_override = zone.elevated_floor_override if zone is not None else None
    elevated_floor = (
        float(elevated_floor_override)
        if elevated_floor_override is not None
        else config.default_elevated_floor
    )

    gas_type = _resolve_zone_gas_type(scenario, zone_key)
    if gas_type is None:
        gas_risk_at_issuance = elevated_floor
        confidence_at_issuance = config.missing_data_confidence
    else:
        sensor = sensor_repo.get_by_zone_and_gas(zone_id, gas_type)
        assert sensor is not None  # guaranteed by validate_references
        zone_readings = sorted(
            (
                GasReading(timestamp=r.timestamp, value=r.value)
                for r in readings
                if r.zone_key == zone_key and r.gas_type == gas_type and r.timestamp <= issued_at
            ),
            key=lambda reading: reading.timestamp,
        )
        gas_risk_at_issuance = calculate_risk(
            zone_readings, float(sensor.alarm_threshold), elevated_floor, issued_at, config
        )
        confidence_at_issuance = calculate_confidence(
            zone_readings, sensor.last_calibrated_at, issued_at, config
        )

    return {
        "schema_version": 1,
        "algorithm_version": config.formula_version,
        "gas_risk_at_issuance": gas_risk_at_issuance,
        "confidence_at_issuance": confidence_at_issuance,
        "captured_at": issued_at.isoformat(),
    }


def run_scenario(path: Path) -> None:
    """Load, validate, generate, and persist a scenario. Fails fast: nothing
    is written if validation fails."""
    scenario = load_scenario(path)
    validate_structure(scenario)

    with get_session() as session:
        validate_references(scenario, session)

        sensor_repo = SensorRepository(session)
        reading_repo = SensorReadingRepository(session)
        permit_repo = PermitRepository(session)
        zone_repo = ZoneRepository(session)

        readings = generate_sensor_readings(scenario)
        for reading in readings:
            zone_id = resolve_id(reading.zone_key)
            sensor = sensor_repo.get_by_zone_and_gas(zone_id, reading.gas_type)
            assert sensor is not None  # guaranteed by validate_references above
            reading_repo.create(
                SensorReading(
                    reading_id=reading.reading_id,
                    sensor_id=sensor.sensor_id,
                    zone_id=zone_id,
                    gas_type=reading.gas_type,
                    value=reading.value,
                    unit="ppm",
                    timestamp=reading.timestamp,
                )
            )
            logger.info(
                "sim reading generated zone=%s gas_type=%s value=%.3f timestamp=%s",
                reading.zone_key,
                reading.gas_type,
                reading.value,
                reading.timestamp.isoformat(),
            )

        for permit in generate_permits(scenario):
            zone_id = resolve_id(permit.zone_key)
            baseline_snapshot = _compute_baseline_snapshot(
                permit.zone_key,
                permit.issued_at,
                scenario,
                readings,
                zone_id,
                sensor_repo,
                zone_repo,
            )
            permit_repo.create(
                Permit(
                    permit_id=permit.permit_id,
                    permit_type=permit.permit_type,
                    zone_id=zone_id,
                    issued_at=permit.issued_at,
                    expires_at=permit.expires_at,
                    authorizing_officer_id=resolve_id(permit.authorizing_officer_key),
                    baseline_snapshot=baseline_snapshot,
                )
            )
            logger.info(
                "sim permit generated zone=%s permit_type=%s issued_at=%s",
                permit.zone_key,
                permit.permit_type,
                permit.issued_at.isoformat(),
            )
