"""Scenario Builder - lets a user compose a scenario through the UI
instead of hand-editing YAML, then executes it through the existing,
unmodified pipeline.

This module is orchestration/wiring only (`src/services/*.py` is not
frozen - CORE_FREEZE.md §9 explicitly allows "extending src/services/
*.py with new orchestration"). It reuses, and never reimplements:

- `src/domain/simulation/scenario.py`'s frozen `Scenario`/`SensorEvent`/
  `PermitEvent` dataclasses and `validate_structure()` (structural
  checks: duplicate names, sim_time/duration sanity, curve/param
  validity - unchanged, called exactly as every YAML scenario already
  is).
- `src/domain/simulation/generator.py`'s frozen `generate_sensor_readings`/
  `generate_permits` (pure functions turning a `Scenario` into the
  concrete readings/permits it describes).
- `src/services/simulation_runner.py`'s already-existing
  `_compute_baseline_snapshot`/`_resolve_zone_gas_type` (permit
  baseline computation via Gas Risk's own frozen `calculate_risk`/
  `calculate_confidence` - reused unchanged, not duplicated).
- `src/services/risk_pipeline.py`'s frozen-engine-wiring `run_zone_tick`
  (the same tick-by-tick driver every existing scenario replay uses).

One deliberate adaptation: the Scenario Builder only ever lets a user
pick FROM already-existing, pre-seeded zones/workers (never author a
new one - see the approved scope decision), so it has no semantic
"zone key" string to put in `SensorEvent.zone_key`/
`PermitEvent.authorizing_officer_key` the way a hand-authored YAML
file does (e.g. `"zone-tank-farm"`, resolved to a real id via the
frozen `resolve_id()`). Those two fields are opaque, caller-defined
strings as far as `generator.py` is concerned (confirmed: neither
function calls `resolve_id` on them, they're threaded straight
through to the output records) - so this module puts the zone/worker's
own `str(uuid.UUID)` in that field and parses it back with plain
`uuid.UUID(...)`, never `resolve_id()`, on the way out. This is not a
frozen-interface change: the field's frozen type is `str`, and this
module's own strings still satisfy it.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.domain.orchestrator.scheduler import AgentCache
from src.domain.orchestrator.tiering import TierState
from src.domain.simulation.generator import generate_permits, generate_sensor_readings
from src.domain.simulation.scenario import (
    PermitEvent,
    Scenario,
    ScenarioValidationError,
    SensorEvent,
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
from src.services.risk_pipeline import RiskPipelineResult, run_zone_tick
from src.services.simulation_runner import _compute_baseline_snapshot


@dataclass(frozen=True)
class SensorEventSpec:
    """A builder-authored sensor event - the same fields as the frozen
    `SensorEvent`, except `zone_id` is a real, already-existing zone's
    UUID (picked from `GET /zones`) rather than a YAML-authored
    semantic key."""

    name: str
    zone_id: uuid.UUID
    gas_type: str
    sim_time: float
    duration_minutes: float
    curve: str
    params: dict[str, float]
    sample_interval_minutes: float = 1.0


@dataclass(frozen=True)
class PermitEventSpec:
    """A builder-authored permit event - `zone_id`/`authorizing_officer_id`
    are real, already-existing UUIDs (picked from `GET /zones` and
    `GET /workers`)."""

    name: str
    zone_id: uuid.UUID
    sim_time: float
    permit_type: str
    authorizing_officer_id: uuid.UUID
    duration_minutes: float


def build_scenario(
    seed: int,
    start_time: datetime,
    sensor_events: list[SensorEventSpec],
    permit_events: list[PermitEventSpec],
) -> Scenario:
    """Build a frozen `Scenario` from builder-authored specs. `zone_id`/
    `authorizing_officer_id` become `zone_key`/`authorizing_officer_key`
    strings via plain `str()` - see module docstring for why this is
    safe (those fields are opaque as far as the frozen generator is
    concerned)."""
    return Scenario(
        seed=seed,
        start_time=start_time.isoformat(),
        sensor_events=[
            SensorEvent(
                name=e.name,
                zone_key=str(e.zone_id),
                gas_type=e.gas_type,
                sim_time=e.sim_time,
                duration_minutes=e.duration_minutes,
                curve=e.curve,
                params=e.params,
                sample_interval_minutes=e.sample_interval_minutes,
            )
            for e in sensor_events
        ],
        permit_events=[
            PermitEvent(
                name=e.name,
                zone_key=str(e.zone_id),
                sim_time=e.sim_time,
                permit_type=e.permit_type,
                authorizing_officer_key=str(e.authorizing_officer_id),
                duration_minutes=e.duration_minutes,
            )
            for e in permit_events
        ],
    )


def validate_builder_scenario(scenario: Scenario, session: Session) -> list[str]:
    """Every validation error for a builder-authored scenario, collected
    rather than raised-on-first (unlike the frozen `validate_structure`,
    which this still calls unchanged and still stops at its first
    finding - the aggregation only applies to the reference/domain
    checks this function itself owns, none of which are frozen).

    Returns an empty list when the scenario is fully valid.
    """
    errors: list[str] = []

    try:
        validate_structure(scenario)
    except ScenarioValidationError as exc:
        errors.append(str(exc))
        return errors  # structural errors make reference checks meaningless

    zones = ZoneRepository(session)
    sensors = SensorRepository(session)
    workers = WorkerRepository(session)

    for sensor_event in scenario.sensor_events:
        try:
            zone_id = uuid.UUID(sensor_event.zone_key)
        except ValueError:
            errors.append(f"event {sensor_event.name!r}: invalid zone id {sensor_event.zone_key!r}")
            continue
        if zones.get(zone_id) is None:
            errors.append(f"event {sensor_event.name!r}: unknown zone {sensor_event.zone_key!r}")
            continue
        if sensors.get_by_zone_and_gas(zone_id, sensor_event.gas_type) is None:
            errors.append(
                f"event {sensor_event.name!r}: no sensor for zone={sensor_event.zone_key!r} "
                f"gas_type={sensor_event.gas_type!r}"
            )

    for permit_event in scenario.permit_events:
        try:
            zone_id = uuid.UUID(permit_event.zone_key)
        except ValueError:
            errors.append(f"event {permit_event.name!r}: invalid zone id {permit_event.zone_key!r}")
        else:
            if zones.get(zone_id) is None:
                errors.append(
                    f"event {permit_event.name!r}: unknown zone {permit_event.zone_key!r}"
                )

        try:
            officer_id = uuid.UUID(permit_event.authorizing_officer_key)
        except ValueError:
            errors.append(
                f"event {permit_event.name!r}: invalid worker id "
                f"{permit_event.authorizing_officer_key!r}"
            )
            continue
        officer = workers.get(officer_id)
        if officer is None:
            errors.append(
                f"event {permit_event.name!r}: unknown authorizing officer "
                f"{permit_event.authorizing_officer_key!r}"
            )
        elif officer.current_zone_id is None:
            # "Worker outside every zone" - an authorizing officer with no
            # current zone assignment at all, not something validate_structure
            # (which has no concept of worker position) could ever catch.
            errors.append(
                f"event {permit_event.name!r}: authorizing officer "
                f"{permit_event.authorizing_officer_key!r} is not currently assigned to any zone"
            )

    # "Negative gas concentration": validate_structure only checks the
    # curve/param *shape*, not what values the curve actually produces -
    # a real (start_value, slope) pair can still ramp below zero. Reuses
    # the frozen, pure generate_sensor_readings() to get the concrete
    # materialized values rather than re-deriving the curve math here.
    if not errors:
        for reading in generate_sensor_readings(scenario):
            if reading.value < 0:
                errors.append(
                    f"zone {reading.zone_key!r} gas_type={reading.gas_type!r}: "
                    f"produces a negative concentration ({reading.value:.3f}) at "
                    f"{reading.timestamp.isoformat()}"
                )
                break  # one report is enough to fail validation

    return errors


@dataclass(frozen=True)
class ZoneExecutionResult:
    zone_id: uuid.UUID
    tick_count: int
    final_tier: str
    final_score: float
    assessment_ids: list[uuid.UUID]


@dataclass(frozen=True)
class ScenarioExecutionResult:
    errors: list[str]
    start_time: datetime | None
    end_time: datetime | None
    zone_results: list[ZoneExecutionResult]

    @property
    def valid(self) -> bool:
        return not self.errors


async def execute_builder_scenario(scenario: Scenario) -> ScenarioExecutionResult:
    """Persist a builder-authored scenario's readings/permits, then run
    it through the same tick-by-tick pipeline every pre-authored
    scenario is replayed through (`run_zone_tick`, unchanged).

    Ephemeral by design (the approved scope): this scenario is not
    written to `scenarios/*.yaml` and never appears in the Scenario
    Library catalog. Each zone starts its own fresh `AgentCache`/
    `TierState` for this run, exactly like every existing scenario
    replay does - there is no cross-scenario state to inherit.
    """
    with get_session() as session:
        errors = validate_builder_scenario(scenario, session)
        if errors:
            return ScenarioExecutionResult(
                errors=errors, start_time=None, end_time=None, zone_results=[]
            )

        sensor_repo = SensorRepository(session)
        reading_repo = SensorReadingRepository(session)
        permit_repo = PermitRepository(session)
        zone_repo = ZoneRepository(session)

        readings = generate_sensor_readings(scenario)
        for reading in readings:
            zone_id = uuid.UUID(reading.zone_key)
            sensor = sensor_repo.get_by_zone_and_gas(zone_id, reading.gas_type)
            assert sensor is not None  # guaranteed by validate_builder_scenario above
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

        for permit in generate_permits(scenario):
            zone_id = uuid.UUID(permit.zone_key)
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
                    authorizing_officer_id=uuid.UUID(permit.authorizing_officer_key),
                    baseline_snapshot=baseline_snapshot,
                )
            )

    # Tick loop: group readings by (zone, gas_type), replay in timestamp
    # order, threading AgentCache/TierState forward per zone - the same
    # sequence this session's manual recovery script ran by hand.
    by_zone_gas: dict[tuple[uuid.UUID, str], list[datetime]] = defaultdict(list)
    for reading in readings:
        by_zone_gas[(uuid.UUID(reading.zone_key), reading.gas_type)].append(reading.timestamp)

    zone_results: list[ZoneExecutionResult] = []
    all_timestamps: list[datetime] = []
    for (zone_id, gas_type), timestamps in by_zone_gas.items():
        timestamps.sort()
        all_timestamps.extend(timestamps)
        cache = AgentCache()
        tier_state = TierState.initial()
        assessment_ids: list[uuid.UUID] = []
        result: RiskPipelineResult | None = None
        for tick_id, sim_time in enumerate(timestamps):
            result = await run_zone_tick(zone_id, gas_type, sim_time, tick_id, cache, tier_state)
            cache = result.cache
            tier_state = result.tier_state
            assessment_ids.append(result.assessment.assessment_id)
        if result is not None:
            zone_results.append(
                ZoneExecutionResult(
                    zone_id=zone_id,
                    tick_count=len(timestamps),
                    final_tier=result.assessment.tier,
                    final_score=result.assessment.compound_risk_score,
                    assessment_ids=assessment_ids,
                )
            )

    return ScenarioExecutionResult(
        errors=[],
        start_time=min(all_timestamps) if all_timestamps else None,
        end_time=max(all_timestamps) if all_timestamps else None,
        zone_results=zone_results,
    )
