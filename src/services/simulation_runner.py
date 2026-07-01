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
"""

import logging
from pathlib import Path

from sqlalchemy.orm import Session

from src.domain.simulation.generator import generate_permits, generate_sensor_readings
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

        for reading in generate_sensor_readings(scenario):
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
            permit_repo.create(
                Permit(
                    permit_id=permit.permit_id,
                    permit_type=permit.permit_type,
                    zone_id=resolve_id(permit.zone_key),
                    issued_at=permit.issued_at,
                    expires_at=permit.expires_at,
                    authorizing_officer_id=resolve_id(permit.authorizing_officer_key),
                    baseline_snapshot={},
                )
            )
            logger.info(
                "sim permit generated zone=%s permit_type=%s issued_at=%s",
                permit.zone_key,
                permit.permit_type,
                permit.issued_at.isoformat(),
            )
