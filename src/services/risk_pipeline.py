"""Risk Pipeline - System Integration Layer.

The single top-level entry point (`run_zone_tick`) that wires the
frozen deterministic engine to the database for one zone, one tick:

    Repositories -> Context Builders -> Scheduler -> Fusion -> Tiering
    -> Justification -> RiskAssessment persistence -> commit
    -> Counterfactual -> Comparison

Orchestrates only. Every calculation is delegated to the frozen engine
(`scheduler.run_tick`, `risk_formula.fuse`, `tiering.transition`,
`justification.build_risk_assessment_justification`,
`counterfactual.evaluate`) - this module contains no risk, tier, or
justification computation of its own, per the Integration Invariants
(`docs/architecture/invariants.md`): "Risk Pipeline only orchestrates."

Agent instances, the execution plan, and every config object are
constructed once at import time and reused across ticks - they are
immutable configuration, the same "construct once, hold as the only
state" discipline every agent already follows internally. A one-time
assertion below guards against a configuration drift between the
execution plan's agent set and Fusion's weighted agent set, since a
mismatch there would surface as a `KeyError` deep inside `fuse()`
instead of at the actual moment the mistake was made.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.domain.agents.equipment_status import EquipmentStatusAgent
from src.domain.agents.gas_risk import GasRiskAgent
from src.domain.agents.permit_intelligence import PermitIntelligenceAgent
from src.domain.agents.worker_exposure import WorkerExposureAgent
from src.domain.orchestrator.counterfactual import CounterfactualResult
from src.domain.orchestrator.counterfactual import evaluate as evaluate_counterfactual
from src.domain.orchestrator.justification import (
    RiskAssessmentJustification,
    build_risk_assessment_justification,
)
from src.domain.orchestrator.risk_formula import FusionConfig, fuse
from src.domain.orchestrator.scheduler import (
    AgentCache,
    ContextBuilder,
    SchedulerConfig,
    build_default_execution_plan,
    run_tick,
)
from src.domain.orchestrator.tiering import TieringConfig, TierState, transition
from src.domain.simulation.ids import resolve_id
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.repositories import RiskAssessmentRepository
from src.infra.db.session import get_session
from src.services.context_builders import (
    build_counterfactual_readings,
    make_equipment_status_context_builder,
    make_gas_risk_context_builder,
    make_permit_intelligence_context_builder,
    make_worker_exposure_context_builder,
)

logger = logging.getLogger(__name__)

_GAS_RISK_AGENT = GasRiskAgent()
_EQUIPMENT_STATUS_AGENT = EquipmentStatusAgent()
_WORKER_EXPOSURE_AGENT = WorkerExposureAgent()
_PERMIT_INTELLIGENCE_AGENT = PermitIntelligenceAgent()

EXECUTION_PLAN = build_default_execution_plan(
    gas_risk_agent=_GAS_RISK_AGENT,
    equipment_status_agent=_EQUIPMENT_STATUS_AGENT,
    permit_intelligence_agent=_PERMIT_INTELLIGENCE_AGENT,
    worker_exposure_agent=_WORKER_EXPOSURE_AGENT,
)
SCHEDULER_CONFIG = SchedulerConfig()
FUSION_CONFIG = FusionConfig()
TIERING_CONFIG = TieringConfig()

_PLAN_AGENT_NAMES = {
    agent.metadata.name for level in EXECUTION_PLAN.levels for agent in level.agents
}
if _PLAN_AGENT_NAMES != set(FUSION_CONFIG.agent_weights):
    raise AssertionError(
        "EXECUTION_PLAN's agents and FusionConfig.agent_weights disagree on the "
        f"agent set: {_PLAN_AGENT_NAMES} != {set(FUSION_CONFIG.agent_weights)}"
    )


@dataclass(frozen=True)
class RiskPipelineResult:
    """Everything one call to `run_zone_tick` produces: the persisted
    row, the two pieces of cross-tick state the caller must thread to
    the next call, and the independent Counterfactual outcome for the
    same tick."""

    assessment: RiskAssessment
    cache: AgentCache
    tier_state: TierState
    counterfactual: CounterfactualResult


def _build_context_builders(session: Session, gas_type: str) -> dict[str, ContextBuilder]:
    return {
        "gas_risk": make_gas_risk_context_builder(session, gas_type),
        "equipment_status": make_equipment_status_context_builder(session),
        "permit_intelligence": make_permit_intelligence_context_builder(session),
        "worker_exposure": make_worker_exposure_context_builder(session),
    }


def _derive_assessment_id(zone_id: uuid.UUID, sim_time: datetime) -> uuid.UUID:
    """Deterministic, not random (`uuid.uuid4()` is never used here) -
    the same `(zone_id, sim_time)` pair always resolves to the same
    id, so re-running a tick overwrites the same row via
    `RiskAssessmentRepository.create()`'s existing `session.merge()`
    rather than duplicating it (Phase 0, Persistence Strategy)."""
    return resolve_id(f"risk_assessment:{zone_id}:{sim_time.isoformat()}")


def _serialize_justification(justification: RiskAssessmentJustification) -> dict[str, object]:
    """Plain-dict form of the frozen `RiskAssessmentJustification`,
    matching `RiskAssessment.justification`'s documented JSONB shape
    field-for-field - explicit, not `dataclasses.asdict`, so an
    accidental future field added to the dataclass can't silently
    change what gets persisted without this function being updated
    too."""
    return {
        "schema_version": justification.schema_version,
        "rules_fired": list(justification.rules_fired),
        "agent_contributions": {
            name: dict(values) for name, values in justification.agent_contributions.items()
        },
        "interaction_bonus_applied": justification.interaction_bonus_applied,
        "tier_before": justification.tier_before,
        "tier_after": justification.tier_after,
    }


def _log_comparison(
    zone_id: uuid.UUID,
    sim_time: datetime,
    tier: str,
    counterfactual_result: CounterfactualResult,
) -> None:
    """The "Comparison" step: an observability hook only, per Phase
    0's own scoping - not a new persisted entity, not a new
    algorithm. A future demo panel (Master Plan M14) or the deferred
    golden-scenario test are the intended readers of this same pair
    of values; this just makes them visible today."""
    logger.info(
        "comparison zone=%s sim_time=%s compound_tier=%s counterfactual_alert=%s "
        "counterfactual_triggered_sensors=%s",
        zone_id,
        sim_time.isoformat(),
        tier,
        counterfactual_result.alert,
        counterfactual_result.triggered_sensors,
    )


async def run_zone_tick(
    zone_id: uuid.UUID,
    gas_type: str,
    sim_time: datetime,
    tick_id: int,
    previous_cache: AgentCache,
    previous_tier_state: TierState,
) -> RiskPipelineResult:
    """The complete per-zone, per-tick sequence (Phase 0, Risk
    Pipeline Design). ``gas_type`` is explicit rather than discovered,
    matching this integration's approved scope: at most one monitored
    gas type per zone (the same limit Gas Risk's own context builder
    factory has - see `context_builders.make_gas_risk_context_builder`).

    One `get_session()` transaction spans every read and the single
    write (all reads and the write commit or roll back together);
    Counterfactual runs afterward, in its own session, so it can never
    affect the already-committed compound result, and its own failure
    can never roll that result back.
    """
    with get_session() as session:
        context_builders = _build_context_builders(session, gas_type)
        agent_results, new_cache = await run_tick(
            EXECUTION_PLAN,
            zone_id,
            sim_time,
            tick_id,
            context_builders,
            previous_cache,
            SCHEDULER_CONFIG,
        )

        fusion_result = fuse(zone_id, sim_time, agent_results, FUSION_CONFIG)
        new_tier_state = transition(previous_tier_state, fusion_result, TIERING_CONFIG)
        justification = build_risk_assessment_justification(
            agent_results,
            fusion_result,
            previous_tier_state.current_tier,
            new_tier_state.current_tier,
        )

        assessment = RiskAssessmentRepository(session).create(
            RiskAssessment(
                assessment_id=_derive_assessment_id(zone_id, sim_time),
                zone_id=zone_id,
                timestamp=sim_time,
                compound_risk_score=fusion_result.compound_risk_score,
                confidence=fusion_result.confidence,
                tier=new_tier_state.current_tier,
                justification=_serialize_justification(justification),
            )
        )

    with get_session() as counterfactual_session:
        counterfactual_readings = build_counterfactual_readings(
            zone_id, [gas_type], counterfactual_session
        )
    counterfactual_result = evaluate_counterfactual(zone_id, sim_time, counterfactual_readings)

    _log_comparison(zone_id, sim_time, new_tier_state.current_tier, counterfactual_result)

    return RiskPipelineResult(
        assessment=assessment,
        cache=new_cache,
        tier_state=new_tier_state,
        counterfactual=counterfactual_result,
    )
