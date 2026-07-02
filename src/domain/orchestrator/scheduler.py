"""Orchestrator Framework (M5A) - the execution graph, per Master Plan A.0.

Runs the four agents in dependency order and nothing else: no fusion
formula, no tiering/hysteresis, no justification-object construction,
no counterfactual comparator - all explicitly deferred to later M5
work. This module answers exactly one question: given a static,
declared execution plan, run each level in order (concurrently within
a level), and produce a result for every agent even when one fails.

Three levels, not two - A.0's own dependency resolution states Worker
Exposure depends on both Gas Risk and Permit Intelligence's outputs,
which cannot fit a two-level graph. Worker Exposure (M3D, frozen)
receives permit information via ``context`` rather than
``upstream_results`` (it predates Permit Intelligence's existence), so
the third level's dependency is expressed through what its context
builder does, not through ``upstream_results`` - see
``docs/architecture/agent_pattern.md`` for why ``context`` exists at
all.

Zero I/O: this module never imports a repository. Building a real
``AgentInput`` (querying sensor readings, permits, etc.) is a
services-layer concern (a future ``risk_pipeline.py``, not built
here) - this scheduler only invokes whatever ``ContextBuilder``
callables it's given.
"""

from __future__ import annotations

import asyncio
import math
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime

from src.domain.agents.base import Agent, AgentInput, AgentResult, Justification

ContextBuilder = Callable[[uuid.UUID, datetime, int, Mapping[str, AgentResult]], AgentInput]
"""Builds one agent's complete AgentInput. Receives the zone, sim_time,
tick_id, and every result already computed by strictly earlier levels
this tick - never later levels, never same-level siblings (they run
concurrently and may not have finished)."""


@dataclass(frozen=True)
class ExecutionLevel:
    """One group of agents that run concurrently - all same-level
    agents are independent of each other by construction."""

    agents: tuple[Agent, ...]


@dataclass(frozen=True)
class ExecutionPlan:
    """A static, explicitly declared execution graph (M5A clarification 2).

    No runtime dependency discovery, no generic workflow engine - the
    levels are authored once (see ``build_default_execution_plan``)
    and never computed from a dependency list at run time.
    """

    levels: tuple[ExecutionLevel, ...]


def build_default_execution_plan(
    gas_risk_agent: Agent,
    equipment_status_agent: Agent,
    permit_intelligence_agent: Agent,
    worker_exposure_agent: Agent,
) -> ExecutionPlan:
    """The canonical three-level plan for this project's four agents
    (M5A clarification 1). Takes agent instances rather than
    constructing them internally, so tests can substitute doubles
    without this module needing to know about test infrastructure.
    """
    return ExecutionPlan(
        levels=(
            ExecutionLevel(agents=(gas_risk_agent, equipment_status_agent)),
            ExecutionLevel(agents=(permit_intelligence_agent,)),
            ExecutionLevel(agents=(worker_exposure_agent,)),
        )
    )


@dataclass(frozen=True)
class AgentCache:
    """Immutable snapshot of every agent's last genuinely successful
    result, keyed by agent name (M5A clarification 6).

    Never holds a decayed substitute - only real, successful
    ``AgentResult``s. This is what lets staleness decay be computed
    fresh each tick from ``AgentResult.computed_at`` without
    compounding: a value that failed three ticks in a row decays based
    on elapsed time since it was last genuinely correct, not based on
    a previously-decayed number decaying again.
    """

    last_known_results: Mapping[str, AgentResult] = field(default_factory=dict)

    def with_result(self, agent_name: str, result: AgentResult) -> AgentCache:
        """Returns a new cache with one entry updated - never mutates
        this instance (M5A clarification 4's explicit state threading)."""
        updated = dict(self.last_known_results)
        updated[agent_name] = result
        return AgentCache(last_known_results=updated)


@dataclass(frozen=True)
class SchedulerConfig:
    """Immutable, tunable parameters - independent of every agent's
    own configuration, per this project's standing discipline."""

    algorithm_name: str = "orchestrator_scheduler"
    algorithm_version: int = 1
    # "Accelerated confidence decay" (Technical Review 4.5, verbatim)
    # for a missing agent - deliberately faster than Gas Risk's own
    # 15-minute-half-life staleness decay (a whole agent failing to
    # report is more urgent than one stale sensor reading).
    staleness_decay_lambda: float = math.log(2) / 5


class NoLastKnownResultError(RuntimeError):
    """Raised when an agent fails and no prior successful result exists
    to decay from - there is nothing to substitute, so this propagates
    rather than fabricating a result from nothing."""


def decay_confidence_for_staleness(
    last_known: AgentResult,
    current_sim_time: datetime,
    config: SchedulerConfig,
) -> AgentResult:
    """Technical Review 4.5: a failing agent's last-known value is
    treated with accelerated confidence decay, never excluded -
    "a missing input is itself informative, not neutral." ``risk`` is
    carried forward unchanged; only ``confidence`` decays.
    """
    elapsed_minutes = max((current_sim_time - last_known.computed_at).total_seconds() / 60.0, 0.0)
    decayed_confidence = last_known.confidence * math.exp(
        -config.staleness_decay_lambda * elapsed_minutes
    )
    return AgentResult(
        agent_name=last_known.agent_name,
        risk=last_known.risk,
        confidence=decayed_confidence,
        justification=Justification(
            summary=f"{last_known.agent_name} did not report this tick; using last-known value.",
            rules_fired=["agent_unavailable_using_last_known"],
            evidence={
                "original_computed_at": last_known.computed_at.isoformat(),
                "elapsed_minutes": elapsed_minutes,
                "original_confidence": last_known.confidence,
            },
        ),
        computed_at=current_sim_time,
    )


async def _run_agent(
    agent: Agent,
    zone_id: uuid.UUID,
    sim_time: datetime,
    tick_id: int,
    builder: ContextBuilder,
    results_so_far: Mapping[str, AgentResult],
) -> AgentResult:
    agent_input = builder(zone_id, sim_time, tick_id, results_so_far)
    return await agent.evaluate(agent_input)


async def run_tick(
    plan: ExecutionPlan,
    zone_id: uuid.UUID,
    sim_time: datetime,
    tick_id: int,
    context_builders: Mapping[str, ContextBuilder],
    previous_cache: AgentCache,
    config: SchedulerConfig,
) -> tuple[dict[str, AgentResult], AgentCache]:
    """Runs one tick of the execution plan, level by level.

    Deterministic execution guarantee (M5A clarification 8): the same
    ``previous_cache`` and the same inputs always produce the same
    ``(results, new_cache)`` pair - no hidden state is read or
    written anywhere in this function.
    """
    results: dict[str, AgentResult] = {}
    cache = previous_cache

    for level in plan.levels:
        outcomes = await asyncio.gather(
            *(
                _run_agent(
                    agent,
                    zone_id,
                    sim_time,
                    tick_id,
                    context_builders[agent.metadata.name],
                    results,
                )
                for agent in level.agents
            ),
            return_exceptions=True,
        )

        for agent, outcome in zip(level.agents, outcomes, strict=True):
            name = agent.metadata.name
            if isinstance(outcome, BaseException):
                last_known = cache.last_known_results.get(name)
                if last_known is None:
                    raise NoLastKnownResultError(
                        f"{name} failed on its first tick; no last-known result to fall back on"
                    ) from outcome
                results[name] = decay_confidence_for_staleness(last_known, sim_time, config)
                # Cache is deliberately NOT updated here - it must keep
                # pointing at the true last-known-good result so a
                # second consecutive failure decays from the same
                # original timestamp, not from an already-decayed one.
            else:
                results[name] = outcome
                cache = cache.with_result(name, outcome)

    return results, cache
