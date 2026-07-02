"""Orchestrator Framework (M5A) tests.

Uses small controllable test doubles for precise mechanic testing
(level ordering, cache threading, decay-on-failure), and the four
real agents for one full end-to-end wiring test (M5A clarification 9).
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from src.domain.agents.base import AgentInput, AgentMetadata, AgentResult, Justification
from src.domain.agents.equipment_status import EquipmentStatusAgent
from src.domain.agents.gas_risk import GasReading, GasRiskAgent
from src.domain.agents.permit_intelligence import PermitIntelligenceAgent
from src.domain.agents.worker_exposure import PermitCoverage, WorkerExposureAgent
from src.domain.orchestrator.scheduler import (
    AgentCache,
    ExecutionLevel,
    ExecutionPlan,
    NoLastKnownResultError,
    SchedulerConfig,
    build_default_execution_plan,
    decay_confidence_for_staleness,
    run_tick,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = SchedulerConfig()


class _ControllableAgent:
    """A test double whose behavior is fully controlled per-instance -
    including its own execution-order recording, so level sequencing
    can be checked without depending on any real agent's internals."""

    def __init__(
        self,
        name: str,
        *,
        should_raise: bool = False,
        risk: float = 10.0,
        confidence: float = 1.0,
        call_log: list[str] | None = None,
    ) -> None:
        self.metadata = AgentMetadata(name=name, description="test double")
        self.should_raise = should_raise
        self.risk = risk
        self.confidence = confidence
        self._call_log = call_log

    async def evaluate(self, input: AgentInput) -> AgentResult:
        if self._call_log is not None:
            self._call_log.append(self.metadata.name)
        if self.should_raise:
            raise RuntimeError("simulated failure")
        return AgentResult(
            agent_name=self.metadata.name,
            risk=self.risk,
            confidence=self.confidence,
            justification=Justification(summary="test"),
            computed_at=input.sim_time,
        )


def _simple_builder(
    zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
) -> AgentInput:
    return AgentInput(
        zone_id=zone_id, sim_time=sim_time, tick_id=tick_id, upstream_results=results_so_far
    )


# --- Level ordering and context assembly -------------------------------------


async def test_level_zero_runs_before_level_one() -> None:
    call_log: list[str] = []
    level0 = _ControllableAgent("a", call_log=call_log)
    level1 = _ControllableAgent("b", call_log=call_log)
    plan = ExecutionPlan(levels=(ExecutionLevel((level0,)), ExecutionLevel((level1,))))
    builders = {"a": _simple_builder, "b": _simple_builder}

    await run_tick(plan, ZONE_ID, NOW, 1, builders, AgentCache(), CONFIG)

    assert call_log == ["a", "b"]


async def test_later_level_receives_earlier_level_results() -> None:
    upstream = _ControllableAgent("upstream", risk=42.0)
    seen_results: dict[str, AgentResult] = {}

    def downstream_builder(
        zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
    ) -> AgentInput:
        seen_results.update(results_so_far)
        return AgentInput(zone_id=zone_id, sim_time=sim_time, tick_id=tick_id)

    downstream = _ControllableAgent("downstream")
    plan = ExecutionPlan(levels=(ExecutionLevel((upstream,)), ExecutionLevel((downstream,))))
    builders = {"upstream": _simple_builder, "downstream": downstream_builder}

    await run_tick(plan, ZONE_ID, NOW, 1, builders, AgentCache(), CONFIG)

    assert seen_results["upstream"].risk == 42.0


# --- Failure handling: decay from last-known value ---------------------------


async def test_successful_result_updates_cache() -> None:
    agent = _ControllableAgent("a", risk=20.0, confidence=0.9)
    plan = ExecutionPlan(levels=(ExecutionLevel((agent,)),))

    _, new_cache = await run_tick(
        plan, ZONE_ID, NOW, 1, {"a": _simple_builder}, AgentCache(), CONFIG
    )

    assert new_cache.last_known_results["a"].risk == 20.0


async def test_failure_falls_back_to_decayed_last_known_value() -> None:
    good_agent = _ControllableAgent("a", risk=30.0, confidence=1.0)
    plan = ExecutionPlan(levels=(ExecutionLevel((good_agent,)),))
    _, cache_after_success = await run_tick(
        plan, ZONE_ID, NOW, 1, {"a": _simple_builder}, AgentCache(), CONFIG
    )

    failing_agent = _ControllableAgent("a", should_raise=True)
    later = NOW + timedelta(minutes=10)
    plan_failing = ExecutionPlan(levels=(ExecutionLevel((failing_agent,)),))
    results, cache_after_failure = await run_tick(
        plan_failing, ZONE_ID, later, 2, {"a": _simple_builder}, cache_after_success, CONFIG
    )

    assert results["a"].risk == 30.0  # risk carried forward unchanged
    assert results["a"].confidence < 1.0  # confidence decayed
    assert results["a"].justification.rules_fired == ["agent_unavailable_using_last_known"]
    # Cache must NOT be overwritten by the decayed substitute.
    assert cache_after_failure.last_known_results["a"].confidence == 1.0


async def test_cache_does_not_compound_decay_across_consecutive_failures() -> None:
    """Two consecutive failures must decay from the SAME original
    timestamp, not compound decay-on-decay."""
    good_agent = _ControllableAgent("a", risk=30.0, confidence=1.0)
    plan_good = ExecutionPlan(levels=(ExecutionLevel((good_agent,)),))
    _, cache = await run_tick(
        plan_good, ZONE_ID, NOW, 1, {"a": _simple_builder}, AgentCache(), CONFIG
    )

    failing_agent = _ControllableAgent("a", should_raise=True)
    plan_failing = ExecutionPlan(levels=(ExecutionLevel((failing_agent,)),))

    tick_2_time = NOW + timedelta(minutes=5)
    results_2, cache = await run_tick(
        plan_failing, ZONE_ID, tick_2_time, 2, {"a": _simple_builder}, cache, CONFIG
    )
    tick_3_time = NOW + timedelta(minutes=10)
    results_3, cache = await run_tick(
        plan_failing, ZONE_ID, tick_3_time, 3, {"a": _simple_builder}, cache, CONFIG
    )

    # Directly computing decay from the true original at 10 minutes
    # elapsed must match tick 3's result exactly - proving tick 2's
    # failure never became the new decay baseline.
    expected = decay_confidence_for_staleness(
        AgentResult(
            agent_name="a",
            risk=30.0,
            confidence=1.0,
            justification=Justification(summary="test"),
            computed_at=NOW,
        ),
        tick_3_time,
        CONFIG,
    )
    assert results_3["a"].confidence == pytest.approx(expected.confidence)
    assert results_3["a"].confidence < results_2["a"].confidence  # strictly more decayed


async def test_first_tick_failure_raises_without_a_last_known_value() -> None:
    agent = _ControllableAgent("a", should_raise=True)
    plan = ExecutionPlan(levels=(ExecutionLevel((agent,)),))

    with pytest.raises(NoLastKnownResultError):
        await run_tick(plan, ZONE_ID, NOW, 1, {"a": _simple_builder}, AgentCache(), CONFIG)


# --- Determinism invariant -----------------------------------------------------


async def test_invariant_identical_inputs_produce_identical_outputs() -> None:
    agent_a = _ControllableAgent("a", risk=15.0, confidence=0.8)
    agent_b = _ControllableAgent("b", risk=25.0, confidence=0.6)
    plan = ExecutionPlan(levels=(ExecutionLevel((agent_a,)), ExecutionLevel((agent_b,))))
    builders = {"a": _simple_builder, "b": _simple_builder}
    previous_cache = AgentCache().with_result(
        "a",
        AgentResult(
            agent_name="a",
            risk=1.0,
            confidence=1.0,
            justification=Justification(summary="prior"),
            computed_at=NOW,
        ),
    )

    results_1, cache_1 = await run_tick(plan, ZONE_ID, NOW, 1, builders, previous_cache, CONFIG)
    results_2, cache_2 = await run_tick(plan, ZONE_ID, NOW, 1, builders, previous_cache, CONFIG)

    assert results_1 == results_2
    assert cache_1 == cache_2


# --- Real agents, full wiring --------------------------------------------------


async def test_full_pipeline_with_real_agents_end_to_end() -> None:
    plan = build_default_execution_plan(
        GasRiskAgent(), EquipmentStatusAgent(), PermitIntelligenceAgent(), WorkerExposureAgent()
    )

    def gas_risk_builder(
        zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
    ) -> AgentInput:
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            context={
                "readings": [GasReading(timestamp=sim_time, value=5.0)],
                "alarm_threshold": 10.0,
                "last_calibrated_at": sim_time,
            },
        )

    def equipment_builder(
        zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
    ) -> AgentInput:
        return AgentInput(
            zone_id=zone_id, sim_time=sim_time, tick_id=tick_id, context={"equipment": []}
        )

    def permit_builder(
        zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
    ) -> AgentInput:
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            context={"permits": [], "permit_feed_stale": False, "adjacent_zones": []},
            upstream_results={"gas_risk": results_so_far["gas_risk"]},
        )

    def worker_builder(
        zone_id: uuid.UUID, sim_time: datetime, tick_id: int, results_so_far: dict[str, AgentResult]
    ) -> AgentInput:
        return AgentInput(
            zone_id=zone_id,
            sim_time=sim_time,
            tick_id=tick_id,
            context={
                "workers_present": [],
                "permit_coverage": PermitCoverage(has_active_permit=False),
            },
            upstream_results={"gas_risk": results_so_far["gas_risk"]},
        )

    builders = {
        "gas_risk": gas_risk_builder,
        "equipment_status": equipment_builder,
        "permit_intelligence": permit_builder,
        "worker_exposure": worker_builder,
    }

    results, new_cache = await run_tick(plan, ZONE_ID, NOW, 1, builders, AgentCache(), CONFIG)

    assert set(results.keys()) == {
        "gas_risk",
        "equipment_status",
        "permit_intelligence",
        "worker_exposure",
    }
    for result in results.values():
        assert 0.0 <= result.risk <= 100.0
        assert 0.0 <= result.confidence <= 1.0
    assert set(new_cache.last_known_results.keys()) == set(results.keys())
