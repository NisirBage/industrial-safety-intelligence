"""Permit Intelligence Agent - Technical Review Section 4.2.

M4A established representations, configurable policy, and pure
validation/decision helpers only (no agent, no state transitions).
M4B (below the "M4B" marker) layers the actual ``PermitIntelligenceAgent``
and its status state machine on top, without changing anything M4A
already defined.

Three deliberately distinct categories run through this file:

- **Observed facts** (``PermitRecord``, ``PermitBaselineSnapshot``,
  ``AdjacentZoneStatus``): what is or was true, snapshotted or
  reported by a caller. Never computed by this module.
- **Configurable policy** (``PermitReasoningConfig``): tunable
  thresholds and mappings - including, since M4B, the status-severity
  ordering and the risk-by-status mapping - independent of any other
  agent's configuration, following the established discipline
  (Gas Risk/Equipment Status/Worker Exposure's own independent
  constants).
- **Resulting decisions** (``BaselineDeltaAssessment``,
  ``SimopsConflict``, and M4B's ``PermitDecision``): the typed,
  evidence-carrying output of applying policy to facts - never a bare
  boolean or a bare status string, so every decision remains
  independently explainable.

Zero I/O, like the rest of ``src/domain/``. Cross-zone facts
(``AdjacentZoneStatus``) travel through ``AgentInput.context``, never
``upstream_results`` - ``upstream_results`` is scoped to same-zone
agent outputs only (M4A clarification 1); a SIMOPS check inherently
needs another zone's data, which ``upstream_results`` (keyed by agent
name, not zone) cannot represent. The agent computes recommendations
only and never calls a repository (M4B clarification 2) - applying a
``PermitDecision`` to persisted state is a separate concern, handled
by ``PermitRepository.update_status()`` and whatever future caller
invokes it.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, cast

from src.domain.agents.base import AgentInput, AgentMetadata, AgentResult, Justification

# --- Observed facts ---------------------------------------------------------

PermitStatus = Literal["active", "flagged", "suspend_recommended", "closed"]
"""Matches src/infra/db/models/permit.py's PERMIT_STATUSES CHECK values
exactly (M4A clarification 2) - not the Technical Review/Master Plan's
uppercase VALID/FLAGGED/SUSPEND_RECOMMENDED prose, which M1's own
schema_decisions.md already reconciled to this lowercase vocabulary."""


@dataclass(frozen=True)
class PermitBaselineSnapshot:
    """What was true when a permit was issued - written once, per M1's
    "baseline_snapshot JSONB is written at issuance and never mutated
    afterward, only compared against."

    Carries its own ``algorithm_version``, separate from
    ``PermitReasoningConfig.algorithm_version``: a permit issued under
    one version of the reasoning module may be re-validated later
    against a newer config, and the snapshot must remain able to say
    which version originally produced its numbers, for auditability
    (M4A clarification 3).
    """

    schema_version: int
    algorithm_version: int
    gas_risk_at_issuance: float
    confidence_at_issuance: float
    captured_at: datetime


@dataclass(frozen=True)
class PermitRecord:
    """One permit as currently persisted, scoped to the zone under evaluation."""

    identifier: str
    permit_type: str  # matches permits.permit_type's CHECK values
    zone_id: uuid.UUID
    status: PermitStatus
    baseline: PermitBaselineSnapshot


@dataclass(frozen=True)
class AdjacentZoneStatus:
    """One adjacent zone's SIMOPS-relevant facts.

    ``gas_risk_score`` approximates Technical Review 4.2's "the
    connecting corridor" - no dedicated corridor entity exists in the
    approved schema (only ``zones`` and ``zone_adjacency``), so the
    adjacent zone's own Gas Risk score is used as the best available
    proxy (M4A clarification 5). This is an approximation, stated
    plainly, not a claim that a corridor is being modeled directly.
    """

    zone_id: uuid.UUID
    active_permit_types: frozenset[str]
    gas_risk_score: float


# --- Configurable policy -----------------------------------------------------


def _default_incompatible_pairs() -> frozenset[frozenset[str]]:
    # Technical Review 4.2's own example: hot work adjacent to confined
    # space entry. Not given as an exhaustive table anywhere - this is
    # the one pair the source document actually names.
    return frozenset({frozenset({"hot_work", "confined_space"})})


def _default_risk_by_status() -> dict[PermitStatus, float]:
    # Proposed, not cited: no numeric risk-by-status mapping is given
    # anywhere. "flagged" reuses the cited ELEVATED value (Technical
    # Review 5.6); "suspend_recommended" is placed above the cited
    # CRITICAL threshold (85) since it is this agent's most severe
    # finding. "closed" permits are never evaluated, so it is omitted.
    return {"active": 0.0, "flagged": 65.0, "suspend_recommended": 90.0}


@dataclass(frozen=True)
class PermitReasoningConfig:
    """Immutable, tunable parameters for permit reasoning policy.

    Every threshold, severity mapping, and the incompatible-pairs
    table live here, not embedded inside the helper functions below
    (M4A clarification 4, extended by M4B clarification 4 to cover the
    status-severity and risk-by-status mappings too), so a policy
    change is a config change, never a code change. Independent of
    every other agent's configuration, per this project's standing
    "no shared/imported constants" discipline.
    """

    algorithm_name: str = "permit_reasoning"
    algorithm_version: int = 1
    # Distinct from algorithm_version: this identifies the *policy*
    # (threshold/mapping values) in force, separate from the
    # *mechanism* (the helper functions' logic) that applies it -
    # M4B clarification 9.
    policy_version: int = 1
    # Not given a numeric value anywhere in the source documents -
    # proposed, not cited.
    risk_delta_threshold: float = 20.0
    incompatible_permit_pairs: frozenset[frozenset[str]] = field(
        default_factory=_default_incompatible_pairs
    )
    # Reuses the cited WATCH/ELEVATED convention (Technical Review 5.6)
    # for judging whether an adjacent zone's own risk is high enough to
    # make a SIMOPS conflict live - independently configured here, not
    # imported from Gas Risk or Worker Exposure.
    adjacent_zone_elevated_threshold: float = 65.0
    # The state machine's ordinal ranking, least to most severe.
    # "closed" is deliberately absent - closed permits are excluded
    # from evaluation entirely, never a recommendation target.
    status_severity_order: tuple[PermitStatus, ...] = ("active", "flagged", "suspend_recommended")
    # Proposed severity mapping for each independent finding - neither
    # is given by the source documents, which describe the two checks
    # but not how their severities combine. SIMOPS is mapped more
    # severely than a baseline breach because Technical Review frames
    # it as the more structurally serious, harder-to-dismiss finding.
    severity_on_baseline_breach: PermitStatus = "flagged"
    severity_on_simops_conflict: PermitStatus = "suspend_recommended"
    severity_on_stale_feed: PermitStatus = "flagged"
    risk_by_status: dict[PermitStatus, float] = field(default_factory=_default_risk_by_status)
    missing_adjacent_data_confidence: float = 0.1


# --- Resulting decisions ------------------------------------------------------


@dataclass(frozen=True)
class BaselineDeltaAssessment:
    """The outcome of comparing live zone risk to a permit's baseline.

    Carries the raw numbers that produced ``exceeded``, not just the
    boolean itself, so the decision is independently verifiable.
    """

    baseline_gas_risk: float
    live_gas_risk: float
    delta: float
    threshold: float
    exceeded: bool


@dataclass(frozen=True)
class SimopsConflict:
    """One detected SIMOPS conflict: an adjacent zone holding an
    incompatible permit type while its own (corridor-approximating)
    gas risk is elevated.
    """

    adjacent_zone_id: uuid.UUID
    permit_type: str
    conflicting_permit_type: str
    adjacent_gas_risk: float


def assess_baseline_delta(
    baseline: PermitBaselineSnapshot,
    live_gas_risk: float,
    config: PermitReasoningConfig,
) -> BaselineDeltaAssessment:
    """Compares live zone risk to the permit's baseline-at-issuance,
    per Technical Review 4.2: "compare live zone risk to baseline plus
    a delta threshold."
    """
    delta = live_gas_risk - baseline.gas_risk_at_issuance
    return BaselineDeltaAssessment(
        baseline_gas_risk=baseline.gas_risk_at_issuance,
        live_gas_risk=live_gas_risk,
        delta=delta,
        threshold=config.risk_delta_threshold,
        exceeded=delta > config.risk_delta_threshold,
    )


def _is_incompatible_pair(type_a: str, type_b: str, config: PermitReasoningConfig) -> bool:
    return frozenset({type_a, type_b}) in config.incompatible_permit_pairs


def detect_simops_conflicts(
    permit_type: str,
    adjacent_zones: Sequence[AdjacentZoneStatus],
    config: PermitReasoningConfig,
) -> list[SimopsConflict]:
    """Checks whether any adjacent zone holds an incompatible permit
    type while its own gas risk is elevated, per Technical Review
    4.2's SIMOPS decision logic.
    """
    conflicts: list[SimopsConflict] = []
    for adjacent in adjacent_zones:
        if adjacent.gas_risk_score < config.adjacent_zone_elevated_threshold:
            continue
        for other_type in adjacent.active_permit_types:
            if _is_incompatible_pair(permit_type, other_type, config):
                conflicts.append(
                    SimopsConflict(
                        adjacent_zone_id=adjacent.zone_id,
                        permit_type=permit_type,
                        conflicting_permit_type=other_type,
                        adjacent_gas_risk=adjacent.gas_risk_score,
                    )
                )
    return conflicts


# --- M4B: recommendation, confidence, risk, and the agent itself ------------
#
# Everything below wires M4A's fact/policy/decision building blocks into
# the actual Agent-protocol implementation. The agent computes
# recommendations only (M4B clarification 2) - it never calls a
# repository. Applying a PermitDecision to persisted state (via the
# additive PermitRepository.update_status()) is a separate concern,
# deliberately outside this module.


@dataclass(frozen=True)
class PermitDecision:
    """One permit's recommendation - not yet applied to persistence.

    ``baseline_assessment`` is ``None`` only on the fail-open-never
    path (feed stale), where no live comparison was possible at all.
    """

    permit_identifier: str
    previous_status: PermitStatus
    recommended_status: PermitStatus
    baseline_assessment: BaselineDeltaAssessment | None
    simops_conflicts: list[SimopsConflict]
    reason: str


def determine_recommended_status(
    previous_status: PermitStatus,
    baseline_assessment: BaselineDeltaAssessment | None,
    simops_conflicts: Sequence[SimopsConflict],
    config: PermitReasoningConfig,
) -> PermitStatus:
    """Escalation-only (M4B clarification 5): never recommends a status
    less severe than ``previous_status``. De-escalating a flagged or
    suspend-recommended permit requires an explicit supervisory action
    outside this agent's scope - this function cannot produce that
    outcome even if current conditions look fine again.

    ``baseline_assessment is None`` means the permit feed itself was
    stale (fail-open-never) - the only case where a stale-feed
    severity applies instead of the two independent-finding checks.
    """
    order = config.status_severity_order
    candidates: list[PermitStatus] = [previous_status]

    if baseline_assessment is None:
        candidates.append(config.severity_on_stale_feed)
    else:
        if baseline_assessment.exceeded:
            candidates.append(config.severity_on_baseline_breach)
        if simops_conflicts:
            candidates.append(config.severity_on_simops_conflict)

    return max(candidates, key=order.index)


def calculate_confidence(
    gas_risk_confidence: float,
    adjacent_zones_provided: bool,
    config: PermitReasoningConfig,
) -> float:
    """Minimum of independent sources (M4B clarification 6): the
    upstream Gas Risk agent's own confidence (a decision derived from
    an uncertain upstream number inherits that uncertainty - the first
    agent in this project whose confidence depends on another agent's
    confidence, not just its risk), and whether adjacent-zone data was
    actually supplied for the SIMOPS check.
    """
    adjacent_data_confidence = (
        1.0 if adjacent_zones_provided else config.missing_adjacent_data_confidence
    )
    return min(gas_risk_confidence, adjacent_data_confidence)


def calculate_risk(recommended_status: PermitStatus, config: PermitReasoningConfig) -> float:
    """Maps the recommended status to the common 0-100 risk scale via
    config (M4B clarification 4) - not cited anywhere, since Permit
    Intelligence's output is fundamentally categorical, not a physical
    quantity like the three Tier-0 agents'.
    """
    return config.risk_by_status[recommended_status]


def _describe_reason(
    baseline_assessment: BaselineDeltaAssessment | None,
    simops_conflicts: Sequence[SimopsConflict],
) -> str:
    if baseline_assessment is None:
        return "permit feed stale - fail-open-never"
    reasons = []
    if baseline_assessment.exceeded:
        reasons.append(
            f"baseline delta {baseline_assessment.delta:.1f} exceeds "
            f"threshold {baseline_assessment.threshold:.1f}"
        )
    if simops_conflicts:
        reasons.append(f"{len(simops_conflicts)} SIMOPS conflict(s) detected")
    return "; ".join(reasons) if reasons else "within policy"


def build_permit_decision(
    permit: PermitRecord,
    recommended_status: PermitStatus,
    baseline_assessment: BaselineDeltaAssessment | None,
    simops_conflicts: Sequence[SimopsConflict],
) -> PermitDecision:
    return PermitDecision(
        permit_identifier=permit.identifier,
        previous_status=permit.status,
        recommended_status=recommended_status,
        baseline_assessment=baseline_assessment,
        simops_conflicts=list(simops_conflicts),
        reason=_describe_reason(baseline_assessment, simops_conflicts),
    )


def build_justification(
    decisions: Sequence[PermitDecision],
    feed_stale: bool,
    gas_risk_confidence: float,
    adjacent_zones_provided: bool,
    config: PermitReasoningConfig,
) -> Justification:
    evidence: dict[str, object] = {
        "algorithm_name": config.algorithm_name,
        "algorithm_version": config.algorithm_version,
        "policy_version": config.policy_version,
        "permit_feed_stale": feed_stale,
        "gas_risk_confidence_used": gas_risk_confidence,
        "adjacent_zones_provided": adjacent_zones_provided,
        "decisions": [
            {
                "permit_identifier": d.permit_identifier,
                "previous_status": d.previous_status,
                "recommended_status": d.recommended_status,
                "baseline_delta": (
                    d.baseline_assessment.delta if d.baseline_assessment is not None else None
                ),
                "simops_conflict_count": len(d.simops_conflicts),
                "reason": d.reason,
            }
            for d in decisions
        ],
    }

    if feed_stale:
        rules_fired = ["fail_open_never"]
        summary = (
            f"Permit feed stale; {len(decisions)} open permit(s) escalated "
            f"to at least {config.severity_on_stale_feed!r}."
        )
    elif not decisions:
        rules_fired = ["no_open_permits"]
        summary = "No open permits in this zone."
    else:
        escalated = [d for d in decisions if d.recommended_status != d.previous_status]
        if escalated:
            rules_fired = ["permit_status_escalated"]
            summary = f"{len(escalated)} of {len(decisions)} permit(s) recommended for escalation."
        else:
            rules_fired = ["permits_within_policy"]
            summary = f"All {len(decisions)} open permit(s) remain within policy."

    return Justification(summary=summary, rules_fired=rules_fired, evidence=evidence)


def _extract_permits(context: Mapping[str, object]) -> list[PermitRecord]:
    return cast(list[PermitRecord], context.get("permits", []))


def _extract_feed_stale(context: Mapping[str, object]) -> bool:
    return cast(bool, context.get("permit_feed_stale", False))


def _extract_adjacent_zones(context: Mapping[str, object]) -> list[AdjacentZoneStatus] | None:
    value = context.get("adjacent_zones")
    if value is None:
        return None
    return cast(list[AdjacentZoneStatus], value)


class PermitIntelligenceAgent:
    """Implements the M3A ``Agent`` protocol for permit intelligence (Tier-1).

    Consumes ``upstream_results["gas_risk"]`` - never imports or calls
    ``GasRiskAgent`` directly, the same rule Worker Exposure follows.
    Computes recommendations only; never writes to a repository (M4B
    clarification 2).
    """

    metadata = AgentMetadata(
        name="permit_intelligence",
        description=(
            "Validates open permits against live zone risk and SIMOPS "
            "adjacency, recommending status escalations only."
        ),
    )

    def __init__(self, config: PermitReasoningConfig | None = None) -> None:
        self._config = config or PermitReasoningConfig()

    async def evaluate(self, input: AgentInput) -> AgentResult:
        gas_risk_result = input.upstream_results["gas_risk"]
        live_gas_risk = gas_risk_result.risk
        gas_risk_confidence = gas_risk_result.confidence

        permits = _extract_permits(input.context)
        feed_stale = _extract_feed_stale(input.context)
        adjacent_zones = _extract_adjacent_zones(input.context)
        adjacent_zones_provided = adjacent_zones is not None

        open_permits = [p for p in permits if p.status != "closed"]

        decisions: list[PermitDecision] = []
        for permit in open_permits:
            if feed_stale:
                recommended = determine_recommended_status(permit.status, None, [], self._config)
                decisions.append(build_permit_decision(permit, recommended, None, []))
                continue

            baseline_assessment = assess_baseline_delta(
                permit.baseline, live_gas_risk, self._config
            )
            simops_conflicts = detect_simops_conflicts(
                permit.permit_type, adjacent_zones or [], self._config
            )
            recommended = determine_recommended_status(
                permit.status, baseline_assessment, simops_conflicts, self._config
            )
            decisions.append(
                build_permit_decision(permit, recommended, baseline_assessment, simops_conflicts)
            )

        confidence = calculate_confidence(
            gas_risk_confidence, adjacent_zones_provided, self._config
        )
        risk = max(
            (calculate_risk(d.recommended_status, self._config) for d in decisions),
            default=0.0,
        )
        justification = build_justification(
            decisions, feed_stale, gas_risk_confidence, adjacent_zones_provided, self._config
        )

        return AgentResult(
            agent_name=self.metadata.name,
            risk=risk,
            confidence=confidence,
            justification=justification,
            computed_at=input.sim_time,
        )
