"""Compute-only performance benchmark for the deterministic engine.

M7 (End-to-End Integration Verification & Production Hardening) asks
for one-zone, ten-zone, and hundred-tick timing measurements. This
sandbox has no Docker, no local PostgreSQL install, and no running
Postgres/Timescale service (confirmed directly: no ``docker`` binary
on PATH, no ``psql``/``postgres`` binary, no matching Windows
service) - there is no live database to measure real repository I/O
against. This script measures what remains measurable without one:
the frozen engine's own CPU-bound path (agent evaluation, Fusion,
Tiering, Justification) via hand-built, in-memory ``ContextBuilder``
closures that never touch a repository. It deliberately excludes
Context Builder database queries and `RiskAssessment` persistence,
which is where most of the wall-clock time in a real deployment would
actually go.

Not a pytest test - a measurement script, matching M7's own framing:
"This is not optimization. Record measurements only." No assertion
here passes or fails; it prints numbers for the Engineering Report to
record.

Run: python scripts/benchmark_deterministic_engine.py
"""

import asyncio
import time
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime

from src.domain.agents.base import AgentInput, AgentResult
from src.domain.agents.equipment_status import EquipmentStatusAgent
from src.domain.agents.gas_risk import GasReading, GasRiskAgent
from src.domain.agents.permit_intelligence import PermitIntelligenceAgent
from src.domain.agents.worker_exposure import PermitCoverage, WorkerExposureAgent, WorkerPresence
from src.domain.orchestrator.justification import build_risk_assessment_justification
from src.domain.orchestrator.risk_formula import FusionConfig, fuse
from src.domain.orchestrator.scheduler import (
    AgentCache,
    SchedulerConfig,
    build_default_execution_plan,
    run_tick,
)
from src.domain.orchestrator.tiering import TieringConfig, TierState, transition

NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)

_GAS_RISK_AGENT = GasRiskAgent()
_EQUIPMENT_STATUS_AGENT = EquipmentStatusAgent()
_WORKER_EXPOSURE_AGENT = WorkerExposureAgent()
_PERMIT_INTELLIGENCE_AGENT = PermitIntelligenceAgent()

_PLAN = build_default_execution_plan(
    gas_risk_agent=_GAS_RISK_AGENT,
    equipment_status_agent=_EQUIPMENT_STATUS_AGENT,
    permit_intelligence_agent=_PERMIT_INTELLIGENCE_AGENT,
    worker_exposure_agent=_WORKER_EXPOSURE_AGENT,
)
_SCHEDULER_CONFIG = SchedulerConfig()
_FUSION_CONFIG = FusionConfig()
_TIERING_CONFIG = TieringConfig()


def _gas_risk_builder(
    zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: Mapping[str, AgentResult]
) -> AgentInput:
    return AgentInput(
        zone_id=zone_id,
        sim_time=sim_time,
        tick_id=tick_id,
        upstream_results=results_so_far,
        context={
            "readings": [GasReading(timestamp=sim_time, value=12.0)],
            "alarm_threshold": 35.0,
            "last_calibrated_at": None,
            "elevated_floor_override": None,
        },
    )


def _equipment_builder(
    zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: Mapping[str, AgentResult]
) -> AgentInput:
    return AgentInput(
        zone_id=zone_id,
        sim_time=sim_time,
        tick_id=tick_id,
        upstream_results=results_so_far,
        context={"equipment": []},
    )


def _permit_builder(
    zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: Mapping[str, AgentResult]
) -> AgentInput:
    return AgentInput(
        zone_id=zone_id,
        sim_time=sim_time,
        tick_id=tick_id,
        upstream_results=results_so_far,
        context={"permits": [], "permit_feed_stale": False, "adjacent_zones": []},
    )


def _worker_builder(
    zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: Mapping[str, AgentResult]
) -> AgentInput:
    return AgentInput(
        zone_id=zone_id,
        sim_time=sim_time,
        tick_id=tick_id,
        upstream_results=results_so_far,
        context={
            "workers_present": [WorkerPresence(identifier="w1", role="operator")],
            "permit_coverage": PermitCoverage(has_active_permit=False),
        },
    )


_CONTEXT_BUILDERS = {
    "gas_risk": _gas_risk_builder,
    "equipment_status": _equipment_builder,
    "permit_intelligence": _permit_builder,
    "worker_exposure": _worker_builder,
}


async def _run_one_tick(
    zone_id: uuid.UUID,
    sim_time: datetime,
    tick_id: int,
    cache: AgentCache,
    tier_state: TierState,
) -> tuple[AgentCache, TierState]:
    """One full compute-only pass: Scheduler -> Fusion -> Tiering ->
    Justification. No repository is ever touched by the closures
    above, so this measures the frozen engine's own CPU cost only."""
    results, new_cache = await run_tick(
        _PLAN, zone_id, sim_time, tick_id, _CONTEXT_BUILDERS, cache, _SCHEDULER_CONFIG
    )
    fusion_result = fuse(zone_id, sim_time, results, _FUSION_CONFIG)
    new_tier_state = transition(tier_state, fusion_result, _TIERING_CONFIG)
    build_risk_assessment_justification(
        results, fusion_result, tier_state.current_tier, new_tier_state.current_tier
    )
    return new_cache, new_tier_state


async def benchmark_one_zone_one_tick() -> float:
    zone_id = uuid.uuid4()
    start = time.perf_counter()
    await _run_one_tick(zone_id, NOW, 1, AgentCache(), TierState.initial())
    return time.perf_counter() - start


async def benchmark_ten_zones() -> float:
    start = time.perf_counter()
    for _ in range(10):
        zone_id = uuid.uuid4()
        await _run_one_tick(zone_id, NOW, 1, AgentCache(), TierState.initial())
    return time.perf_counter() - start


async def benchmark_one_hundred_ticks() -> float:
    zone_id = uuid.uuid4()
    cache = AgentCache()
    tier_state = TierState.initial()
    start = time.perf_counter()
    for tick in range(100):
        cache, tier_state = await _run_one_tick(zone_id, NOW, tick, cache, tier_state)
    return time.perf_counter() - start


async def main() -> None:
    await benchmark_one_zone_one_tick()  # warm-up, excluded from recorded measurements

    one_zone_seconds = await benchmark_one_zone_one_tick()
    ten_zones_seconds = await benchmark_ten_zones()
    hundred_ticks_seconds = await benchmark_one_hundred_ticks()

    print("=== Deterministic engine compute-only benchmark ===")
    print("(No database available in this sandbox - Context Builder queries and")
    print(" RiskAssessment persistence are excluded; see the M7 Engineering Report.)")
    print(f"One zone, one tick:     {one_zone_seconds * 1000:.3f} ms")
    print(
        f"Ten zones (sequential): {ten_zones_seconds * 1000:.3f} ms total, "
        f"{ten_zones_seconds * 1000 / 10:.3f} ms/zone"
    )
    print(
        f"One hundred ticks:      {hundred_ticks_seconds * 1000:.3f} ms total, "
        f"{hundred_ticks_seconds * 1000 / 100:.3f} ms/tick"
    )


if __name__ == "__main__":
    asyncio.run(main())
