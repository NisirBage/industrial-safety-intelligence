"""Worker Exposure Agent - Technical Review Section 4.3.

Weights zone headcount by the upstream Gas Risk Agent's score to
produce an exposure risk contribution, and flags workers present in
an at-risk zone with no active permit covering it. ``WorkerPresence``
and ``PermitCoverage`` are scoped to this file, following the pattern
``GasReading``/``EquipmentRecord`` set in the previous two agents.

Zero I/O: every value arrives via ``AgentInput.context`` or
``AgentInput.upstream_results``. This agent never imports, constructs,
or calls ``GasRiskAgent`` directly (M3D clarification 6) - it reads
Gas Risk's already-published ``AgentResult`` through
``upstream_results``, which is exactly the tier-agnostic mechanism
M3A built for this.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from src.domain.agents.base import AgentInput, AgentMetadata, AgentResult, Justification


@dataclass(frozen=True)
class WorkerPresence:
    """One worker currently present in the zone under evaluation."""

    identifier: str
    role: str


@dataclass(frozen=True)
class PermitCoverage:
    """Lightweight, extensible permit-coverage fact for a zone.

    Exposes only whether an active permit exists for now; future
    permit metadata (type, expiry, authorizing officer) can be added
    here without changing this agent's context contract (M3D
    clarification 2). Not the eventual Permit Intelligence
    ``AgentResult`` - M4 doesn't exist yet, and this type deliberately
    doesn't guess at its shape; whoever builds M5/M6's caller derives
    this fact from M4's output however it turns out to work.
    """

    has_active_permit: bool


@dataclass(frozen=True)
class WorkerExposureConfig:
    """Immutable, tunable parameters - the only state a
    ``WorkerExposureAgent`` instance retains between evaluations.

    Tier thresholds are Worker Exposure's own independent copy of the
    WATCH/ELEVATED/CRITICAL cutoffs (Technical Review 5.6), not
    shared or imported from Gas Risk or the not-yet-built Orchestrator
    tiering module. Tier weights are not given any numeric value in
    the source documents - the defaults here are a proposed,
    increasing-by-tier schedule, flagged as such.
    """

    algorithm_name: str = "worker_exposure"
    algorithm_version: int = 1
    formula_version: int = 1
    steepness_k: float = 2 * math.log(2)
    watch_threshold: float = 40.0
    elevated_threshold: float = 65.0
    critical_threshold: float = 85.0
    below_watch_weight: float = 0.0
    watch_weight: float = 1.0
    elevated_weight: float = 2.0
    critical_weight: float = 4.0
    missing_context_confidence: float = 0.1
    # A safety default, not an occupancy estimate (M3D clarification 4):
    # when the location feed is missing, this is the minimum headcount
    # assumed present, never zero - "never assume empty."
    fail_safe_assumed_headcount: int = 1


def calculate_tier_weight(gas_risk_score: float, config: WorkerExposureConfig) -> float:
    """Maps the upstream Gas Risk score to a tier weight.

    Below WATCH the weight is zero: Technical Review 4.3 states this
    agent's contribution is "only actionable once gas/permit risk is
    already elevated."
    """
    if gas_risk_score >= config.critical_threshold:
        return config.critical_weight
    if gas_risk_score >= config.elevated_threshold:
        return config.elevated_weight
    if gas_risk_score >= config.watch_threshold:
        return config.watch_weight
    return config.below_watch_weight


def calculate_risk(headcount: int, tier_weight: float, config: WorkerExposureConfig) -> float:
    """Saturating function of tier-weighted headcount, reusing the same
    mathematical family as Gas Risk and Equipment Status, with Worker
    Exposure's own independent ``steepness_k``.
    """
    weighted_exposure = headcount * tier_weight
    if weighted_exposure <= 0:
        return 0.0
    return 100.0 * (1.0 - math.exp(-config.steepness_k * weighted_exposure))


def calculate_confidence(context_present: bool, config: WorkerExposureConfig) -> float:
    """A missing location feed leaves no information at all (low
    confidence); a present worker list - even an empty one - is a
    definitive, confirmed fact, the same reasoning Equipment Status
    applies to a confirmed-empty inventory (full confidence).
    """
    return 1.0 if context_present else config.missing_context_confidence


def calculate_unauthorized_workers(
    workers: Sequence[WorkerPresence],
    gas_risk_score: float,
    permit_coverage: PermitCoverage,
    config: WorkerExposureConfig,
) -> list[WorkerPresence]:
    """Workers present in a zone at or above WATCH with no active
    permit covering it - Technical Review 4.3's "unauthorized presence
    flag" output. This is a second, independent domain output (not
    just narrative dressing for the justification), which is the
    compelling domain reason this agent has five pure helpers instead
    of the usual four.
    """
    if permit_coverage.has_active_permit or gas_risk_score < config.watch_threshold:
        return []
    return list(workers)


def build_justification(
    workers: Sequence[WorkerPresence],
    context_present: bool,
    gas_risk_score: float,
    tier_weight: float,
    permit_coverage: PermitCoverage,
    unauthorized_workers: Sequence[WorkerPresence],
    config: WorkerExposureConfig,
) -> Justification:
    evidence: dict[str, object] = {
        "formula_version": config.formula_version,
        "algorithm_name": config.algorithm_name,
        "algorithm_version": config.algorithm_version,
        "headcount": len(workers),
        "gas_risk_score": gas_risk_score,
        "tier_weight": tier_weight,
        "zone_has_active_permit": permit_coverage.has_active_permit,
        "unauthorized_workers": [
            {"identifier": w.identifier, "role": w.role} for w in unauthorized_workers
        ],
    }

    if not context_present:
        return Justification(
            summary=(
                "Worker location data unavailable; assuming a conservative "
                f"minimum occupancy of {config.fail_safe_assumed_headcount} as a safety default."
            ),
            rules_fired=["missing_location_fail_safe"],
            evidence=evidence,
        )

    if unauthorized_workers:
        summary = (
            f"{len(workers)} worker(s) present, tier weight {tier_weight:.1f}; "
            f"{len(unauthorized_workers)} unauthorized (no active permit)."
        )
        rules_fired = ["exposure_weighted_headcount", "unauthorized_presence"]
    else:
        summary = f"{len(workers)} worker(s) present, tier weight {tier_weight:.1f}."
        rules_fired = ["exposure_weighted_headcount"]

    return Justification(summary=summary, rules_fired=rules_fired, evidence=evidence)


def _extract_workers(context: Mapping[str, object]) -> list[WorkerPresence]:
    return cast(list[WorkerPresence], context.get("workers_present", []))


def _extract_permit_coverage(context: Mapping[str, object]) -> PermitCoverage:
    coverage = context.get("permit_coverage")
    if coverage is None:
        # Absence of permit information must never be read as "covered" -
        # that would suppress a legitimate unauthorized-presence flag.
        return PermitCoverage(has_active_permit=False)
    return cast(PermitCoverage, coverage)


class WorkerExposureAgent:
    """Implements the M3A ``Agent`` protocol for worker exposure.

    Stateless with respect to simulation data: ``self._config`` is the
    only thing retained between evaluations, and it is immutable
    configuration, not simulation state.
    """

    metadata = AgentMetadata(
        name="worker_exposure",
        description=(
            "Weights zone headcount by upstream gas risk and flags "
            "unauthorized presence without an active permit."
        ),
    )

    def __init__(self, config: WorkerExposureConfig | None = None) -> None:
        self._config = config or WorkerExposureConfig()

    async def evaluate(self, input: AgentInput) -> AgentResult:
        # A missing upstream Gas Risk result is a scheduler/orchestration
        # bug (Tier-0 must run before this agent), not domain
        # uncertainty - it must propagate, never default to a falsely
        # safe score (M3A's "never assume safe" rule).
        gas_risk_score = input.upstream_results["gas_risk"].risk

        context_present = "workers_present" in input.context
        workers = _extract_workers(input.context)
        permit_coverage = _extract_permit_coverage(input.context)
        headcount = len(workers) if context_present else self._config.fail_safe_assumed_headcount

        tier_weight = calculate_tier_weight(gas_risk_score, self._config)
        risk = calculate_risk(headcount, tier_weight, self._config)
        confidence = calculate_confidence(context_present, self._config)
        unauthorized_workers = (
            calculate_unauthorized_workers(workers, gas_risk_score, permit_coverage, self._config)
            if context_present
            else []
        )
        justification = build_justification(
            workers,
            context_present,
            gas_risk_score,
            tier_weight,
            permit_coverage,
            unauthorized_workers,
            self._config,
        )

        return AgentResult(
            agent_name=self.metadata.name,
            risk=risk,
            confidence=confidence,
            justification=justification,
            computed_at=input.sim_time,
        )
