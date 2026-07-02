"""Context Builders - System Integration Layer.

The services-layer code that closes the gap `docs/architecture/pipeline.md`
used to mark "Planned": the only place that queries M1's repositories
and assembles a complete `AgentInput` per agent, per zone, per tick.
Every factory function below (`make_*_context_builder`) returns a closure
matching the frozen `ContextBuilder` type
(`src/domain/orchestrator/scheduler.py`) exactly - `Callable[[zone_id,
sim_time, tick_id, results_so_far], AgentInput]` - constructed once per
tick batch by `src/services/risk_pipeline.py`, which supplies the
`Session` and any per-zone configuration (e.g. Gas Risk's `gas_type`)
via closure rather than extra positional parameters, since the frozen
`ContextBuilder` signature has no room for them.

Integration invariant (`docs/architecture/invariants.md`): a context
builder only assembles `AgentInput` - it never calculates risk, never
applies business rules, and never duplicates an agent's own logic.
Every function below either (a) queries a repository and reshapes rows
into the domain-scoped types each agent already expects
(`GasReading`, `EquipmentRecord`, `WorkerPresence`, `PermitRecord`,
`AdjacentZoneStatus`), or (b) packages already-reshaped values into the
`context: Mapping[str, object]` dict an agent's own frozen `context`
keys expect. No function here contains a saturating curve, a
threshold comparison, a confidence calculation, or any other
computation an agent itself owns.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import cast

from sqlalchemy.orm import Session

from src.domain.agents.base import AgentInput, AgentResult
from src.domain.agents.equipment_status import EquipmentRecord
from src.domain.agents.gas_risk import GasReading
from src.domain.agents.permit_intelligence import (
    AdjacentZoneStatus,
    PermitBaselineSnapshot,
    PermitRecord,
    PermitStatus,
)
from src.domain.agents.worker_exposure import PermitCoverage, WorkerPresence
from src.domain.orchestrator.counterfactual import CounterfactualReading
from src.domain.orchestrator.scheduler import ContextBuilder
from src.infra.db.models.equipment import Equipment
from src.infra.db.models.permit import Permit
from src.infra.db.models.worker import Worker
from src.infra.db.repositories import (
    EquipmentRepository,
    PermitRepository,
    RiskAssessmentRepository,
    SensorReadingRepository,
    SensorRepository,
    WorkerRepository,
    ZoneAdjacencyRepository,
    ZoneRepository,
)

DEFAULT_READING_WINDOW = 20
"""How many recent readings Gas Risk's context is given - large enough
to satisfy ``GasRiskConfig.min_readings_for_regression`` (3) with
headroom; not itself a domain constant, just a query window size."""


# --- Gas Risk ------------------------------------------------------------------


def _assemble_gas_risk_context(
    readings: Sequence[GasReading],
    alarm_threshold: float,
    last_calibrated_at: datetime | None,
    elevated_floor_override: float | None,
) -> dict[str, object]:
    """Pure reshaping into Gas Risk's own frozen ``context`` keys - no
    computation, testable without a database."""
    return {
        "readings": list(readings),
        "alarm_threshold": alarm_threshold,
        "last_calibrated_at": last_calibrated_at,
        "elevated_floor_override": elevated_floor_override,
    }


def make_gas_risk_context_builder(
    session: Session, gas_type: str, reading_window: int = DEFAULT_READING_WINDOW
) -> ContextBuilder:
    """``gas_type`` is supplied by the caller rather than discovered,
    matching this integration's explicit, approved scope: at most one
    monitored gas type per zone (Phase 0, Context Builder Design) -
    the same assumption ``SensorRepository.get_by_zone_and_gas``'s own
    docstring already states. A zone with more than one gas sensor is
    out of scope until a future milestone resolves how Gas Risk's
    single-stream `AgentInput.context` shape should combine them.
    """
    sensor_repo = SensorRepository(session)
    reading_repo = SensorReadingRepository(session)
    zone_repo = ZoneRepository(session)

    def build(
        zone_id: uuid.UUID,
        sim_time: datetime,
        tick_id: int,
        results_so_far: Mapping[str, AgentResult],
    ) -> AgentInput:
        sensor = sensor_repo.get_by_zone_and_gas(zone_id, gas_type)
        if sensor is None:
            raise ValueError(f"no sensor for zone={zone_id} gas_type={gas_type!r}")

        rows = reading_repo.recent(zone_id, gas_type, sim_time, reading_window)
        readings = [GasReading(timestamp=r.timestamp, value=float(r.value)) for r in rows]

        zone = zone_repo.get(zone_id)
        override = zone.elevated_floor_override if zone is not None else None

        context = _assemble_gas_risk_context(
            readings=readings,
            alarm_threshold=float(sensor.alarm_threshold),
            last_calibrated_at=sensor.last_calibrated_at,
            elevated_floor_override=float(override) if override is not None else None,
        )
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            upstream_results=results_so_far,
            context=context,
        )

    return build


# --- Equipment Status ------------------------------------------------------------


def _to_equipment_record(row: Equipment) -> EquipmentRecord:
    return EquipmentRecord(
        identifier=str(row.equipment_id),
        equipment_type=row.equipment_type,
        isolation_status=row.isolation_status,
        maintenance_flag=row.maintenance_flag,
        loto_confirmed=row.loto_confirmed,
    )


def _assemble_equipment_status_context(equipment: Sequence[EquipmentRecord]) -> dict[str, object]:
    """Always includes the ``"equipment"`` key - a real repository
    query always returns a definite (possibly empty) answer in this
    integration, so the frozen agent's "missing context" branch is
    reachable only via a future deliberate choice to withhold the key,
    not through this builder (Phase 0, Context Builder Design)."""
    return {"equipment": list(equipment)}


def make_equipment_status_context_builder(session: Session) -> ContextBuilder:
    equipment_repo = EquipmentRepository(session)

    def build(
        zone_id: uuid.UUID,
        sim_time: datetime,
        tick_id: int,
        results_so_far: Mapping[str, AgentResult],
    ) -> AgentInput:
        rows = equipment_repo.list_by_zone(zone_id)
        context = _assemble_equipment_status_context([_to_equipment_record(r) for r in rows])
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            upstream_results=results_so_far,
            context=context,
        )

    return build


# --- Worker Exposure ---------------------------------------------------------------


def _to_worker_presence(row: Worker) -> WorkerPresence:
    return WorkerPresence(identifier=str(row.worker_id), role=row.role)


def _derive_permit_coverage(permit_intelligence_result: AgentResult | None) -> PermitCoverage:
    """Derives ``PermitCoverage`` from Permit Intelligence's own
    already-computed ``AgentResult`` rather than a fresh repository
    query - the cross-agent channel ``docs/architecture/execution_graph.md``
    (M5A) already specifies for this exact dependency. Permit
    Intelligence's justification evidence always includes one
    ``"decisions"`` entry per currently-open permit in the zone
    (``permit_intelligence.py``'s own ``evaluate()``), so a non-empty
    list is exactly "this zone has an active permit" - reading that
    fact, not computing a new one.

    If Permit Intelligence itself failed this tick (a decayed
    last-known result, whose evidence carries a different shape with
    no ``"decisions"`` key), this conservatively reports no coverage -
    consistent with this project's standing "unclear information is
    never read as covered" rule, not a special case bolted on here.
    """
    if permit_intelligence_result is None:
        return PermitCoverage(has_active_permit=False)
    evidence = permit_intelligence_result.justification.evidence or {}
    decisions = evidence.get("decisions", [])
    has_active_permit = isinstance(decisions, list) and len(decisions) > 0
    return PermitCoverage(has_active_permit=has_active_permit)


def _assemble_worker_exposure_context(
    workers: Sequence[WorkerPresence], permit_coverage: PermitCoverage
) -> dict[str, object]:
    return {"workers_present": list(workers), "permit_coverage": permit_coverage}


def make_worker_exposure_context_builder(session: Session) -> ContextBuilder:
    worker_repo = WorkerRepository(session)

    def build(
        zone_id: uuid.UUID,
        sim_time: datetime,
        tick_id: int,
        results_so_far: Mapping[str, AgentResult],
    ) -> AgentInput:
        rows = worker_repo.list_by_current_zone(zone_id)
        permit_coverage = _derive_permit_coverage(results_so_far.get("permit_intelligence"))
        context = _assemble_worker_exposure_context(
            [_to_worker_presence(r) for r in rows], permit_coverage
        )
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            upstream_results=results_so_far,
            context=context,
        )

    return build


# --- Permit Intelligence -----------------------------------------------------------


def _parse_baseline_snapshot(raw: Mapping[str, object]) -> PermitBaselineSnapshot:
    """Parses the JSONB ``baseline_snapshot`` written at issuance
    (now a real snapshot - System Integration Layer approved decision
    2, no longer the ``{}`` placeholder). Raises on a malformed
    snapshot rather than silently defaulting: a permit whose baseline
    can't be parsed is an integration/data bug, not domain
    uncertainty (this project's standing "raise on caller
    inconsistency" rule).
    """
    try:
        return PermitBaselineSnapshot(
            schema_version=int(cast(int, raw["schema_version"])),
            algorithm_version=int(cast(int, raw["algorithm_version"])),
            gas_risk_at_issuance=float(cast(float, raw["gas_risk_at_issuance"])),
            confidence_at_issuance=float(cast(float, raw["confidence_at_issuance"])),
            captured_at=datetime.fromisoformat(str(raw["captured_at"])),
        )
    except KeyError as exc:
        raise ValueError(f"malformed baseline_snapshot, missing key: {exc}") from exc


def _to_permit_record(row: Permit) -> PermitRecord:
    return PermitRecord(
        identifier=str(row.permit_id),
        permit_type=row.permit_type,
        zone_id=row.zone_id,
        status=cast(PermitStatus, row.status),
        baseline=_parse_baseline_snapshot(row.baseline_snapshot),
    )


def _extract_gas_risk_score(justification: Mapping[str, object]) -> float | None:
    """Reads an adjacent zone's Gas Risk contribution out of its most
    recently *persisted* justification blob - the resolution Phase 0
    proposed and this milestone was approved to implement: no second,
    same-tick, all-zones orchestration pass, no scheduler redesign.
    Returns ``None`` (never fabricates a number) if the shape is
    missing or unexpected, so a malformed or absent entry simply
    excludes that neighbor rather than inventing a value.
    """
    contributions = justification.get("agent_contributions")
    if not isinstance(contributions, dict):
        return None
    gas_risk = contributions.get("gas_risk")
    if not isinstance(gas_risk, dict):
        return None
    risk = gas_risk.get("risk")
    if not isinstance(risk, int | float):
        return None
    return float(risk)


def _assemble_permit_intelligence_context(
    permits: Sequence[PermitRecord],
    permit_feed_stale: bool,
    adjacent_zones: Sequence[AdjacentZoneStatus],
) -> dict[str, object]:
    return {
        "permits": list(permits),
        "permit_feed_stale": permit_feed_stale,
        "adjacent_zones": list(adjacent_zones),
    }


def make_permit_intelligence_context_builder(
    session: Session, permit_feed_stale: bool = False
) -> ContextBuilder:
    """``permit_feed_stale`` defaults to ``False``: this integration
    has no external permit feed separate from the same database
    Context Builders already query, so nothing can go stale
    independently of an outright query failure - which already
    propagates through the frozen scheduler's own last-known-value
    path, a different and already-adequate channel (Phase 0, Context
    Builder Design).
    """
    permit_repo = PermitRepository(session)
    adjacency_repo = ZoneAdjacencyRepository(session)
    risk_assessment_repo = RiskAssessmentRepository(session)

    def build(
        zone_id: uuid.UUID,
        sim_time: datetime,
        tick_id: int,
        results_so_far: Mapping[str, AgentResult],
    ) -> AgentInput:
        permits = [_to_permit_record(r) for r in permit_repo.list_open_by_zone(zone_id)]

        adjacent_zones: list[AdjacentZoneStatus] = []
        for adjacent_zone_id in adjacency_repo.adjacent_zone_ids(zone_id):
            latest_assessment = risk_assessment_repo.latest_by_zone(adjacent_zone_id)
            if latest_assessment is None:
                continue  # no persisted history yet - excluded, never fabricated
            gas_risk_score = _extract_gas_risk_score(latest_assessment.justification)
            if gas_risk_score is None:
                continue
            adjacent_permits = permit_repo.list_open_by_zone(adjacent_zone_id)
            adjacent_zones.append(
                AdjacentZoneStatus(
                    zone_id=adjacent_zone_id,
                    active_permit_types=frozenset(p.permit_type for p in adjacent_permits),
                    gas_risk_score=gas_risk_score,
                )
            )

        context = _assemble_permit_intelligence_context(permits, permit_feed_stale, adjacent_zones)
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            upstream_results=results_so_far,
            context=context,
        )

    return build


# --- Counterfactual (not an Agent, no ContextBuilder) -------------------------------


def build_counterfactual_readings(
    zone_id: uuid.UUID, gas_types: Sequence[str], session: Session
) -> list[CounterfactualReading]:
    """Assembles Counterfactual's independent input directly - not a
    ``ContextBuilder`` (Counterfactual isn't an ``Agent``). ``gas_types``
    is supplied by the caller for the same reason Gas Risk's
    ``gas_type`` is (no repository lists "every gas type monitored in
    a zone" today, and inventing one is unneeded: the caller already
    knows which sensors exist for this integration's seed data).

    A sensor with no reading yet is silently excluded, not fabricated
    - matching Counterfactual's own frozen "missing data produces no
    alert" behaviour, not a new failure mode introduced here.
    """
    sensor_repo = SensorRepository(session)
    reading_repo = SensorReadingRepository(session)

    readings: list[CounterfactualReading] = []
    for gas_type in gas_types:
        sensor = sensor_repo.get_by_zone_and_gas(zone_id, gas_type)
        if sensor is None:
            continue
        latest = reading_repo.latest(zone_id, gas_type)
        if latest is None:
            continue
        readings.append(
            CounterfactualReading(
                sensor_id=str(sensor.sensor_id),
                value=float(latest.value),
                alarm_threshold=float(sensor.alarm_threshold),
            )
        )
    return readings
