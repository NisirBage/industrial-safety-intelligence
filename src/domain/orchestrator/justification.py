"""Justification Builder - assembles the frozen ``risk_assessments.justification``
shape (Master Plan A.4, see ``src/infra/db/models/risk_assessment.py``'s
docstring for the exact contract this module must produce).

Combines three already-computed, independent outputs - the scheduler's
raw ``dict[str, AgentResult]`` (M5A), a ``FusionResult`` (M5B), and a
tier transition (``tier_before``/``tier_after``, from ``tiering.py``) -
into one ``RiskAssessmentJustification``. It performs no computation
of its own beyond reshaping and aggregating: it does not recompute
risk, execute an agent, perform fusion, or run the hysteresis state
machine (Justification Builder clarification 6). This is the one
object that later feeds both the audit log and the RAG agent (future
milestones) without either needing to reconstruct it independently
(``docs/architecture/pipeline.md``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.domain.agents.base import AgentResult
from src.domain.orchestrator.risk_formula import FusionResult

JUSTIFICATION_SCHEMA_VERSION = 1

# This module's own copy of the tier severity order - not imported
# from tiering.py, per this project's standing discipline of
# independent per-module copies of shared constants (Gas Risk's
# elevated_floor, Fusion's elevated_floor, Tiering's thresholds are
# each declared separately too). Knowing that "critical" outranks
# "watch" is domain vocabulary, not the hysteresis state machine
# itself - this module only compares two already-decided tier names,
# it never decides one (Justification Builder clarification 6).
_TIER_ORDER = ("normal", "watch", "elevated", "critical")


@dataclass(frozen=True)
class RiskAssessmentJustification:
    """A dedicated type matching the frozen persistence schema field-
    for-field - not a reuse of the agent-level ``Justification``
    (``src/domain/agents/base.py``), which describes a single agent's
    own pre-fusion reasoning, not the post-fusion, per-tick record
    this table stores (Justification Builder clarification 1).

    Every field name and shape here must stay identical to
    ``RiskAssessment.justification``'s documented contract; extending
    or renaming anything here without updating that docstring (and
    getting it approved) would silently break M6/M11's readers.
    """

    schema_version: int
    rules_fired: list[str]
    agent_contributions: dict[str, dict[str, float]]
    interaction_bonus_applied: float
    tier_before: str
    tier_after: str


def _dedupe_preserving_order(items: list[str]) -> list[str]:
    """First-occurrence order preserved, duplicates dropped -
    Justification Builder clarification 4."""
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            deduped.append(item)
    return deduped


def build_agent_contributions(fusion_result: FusionResult) -> dict[str, dict[str, float]]:
    """Reshapes ``FusionResult.agent_contributions`` into the frozen
    ``{agent_name: {"risk": ..., "confidence": ...}}`` mapping.

    Sourced exclusively from ``FusionResult`` - never from the raw
    ``AgentResult``s - per Justification Builder clarification 2:
    Fusion already read each agent's risk and confidence once: this
    must not become a second, potentially-divergent source of truth
    for the same numbers.
    """
    return {
        contribution.agent_name: {
            "risk": contribution.raw_risk,
            "confidence": contribution.confidence,
        }
        for contribution in fusion_result.agent_contributions
    }


def determine_tier_transition_rule(tier_before: str, tier_after: str) -> str:
    """One derived rule identifier describing the tier transition
    itself, appended to ``rules_fired`` alongside every agent's and
    Fusion's own rules (Justification Builder clarification 3)."""
    if tier_before == tier_after:
        return "tier_stable"
    if _TIER_ORDER.index(tier_after) > _TIER_ORDER.index(tier_before):
        return "tier_escalated"
    return "tier_de_escalated"


def build_rules_fired(
    agent_results: Mapping[str, AgentResult],
    fusion_result: FusionResult,
    agent_contributions: dict[str, dict[str, float]],
    tier_before: str,
    tier_after: str,
) -> list[str]:
    """Aggregates rule identifiers from every agent (in Fusion's own
    agent order), then Fusion, then the one derived tier-transition
    rule - preserving order while deduplicating (Justification Builder
    clarifications 3 and 4).

    Iterates ``agent_contributions`` (not ``agent_results``) so the
    agent order matches exactly what Fusion actually used.
    """
    collected: list[str] = []
    for agent_name in agent_contributions:
        collected.extend(agent_results[agent_name].justification.rules_fired)
    collected.extend(fusion_result.rules_fired)
    collected.append(determine_tier_transition_rule(tier_before, tier_after))
    return _dedupe_preserving_order(collected)


def build_risk_assessment_justification(
    agent_results: Mapping[str, AgentResult],
    fusion_result: FusionResult,
    tier_before: str,
    tier_after: str,
) -> RiskAssessmentJustification:
    """Assembles the complete, frozen-schema justification object.

    Raises ``KeyError`` if ``agent_results`` is missing an entry
    Fusion already used to compute ``fusion_result.agent_contributions``
    - a caller inconsistency (the scheduler output and the fusion
    output disagreeing about which agents ran) is an integration
    failure, never silently producing an incomplete justification
    (Justification Builder clarification 5).
    """
    agent_contributions = build_agent_contributions(fusion_result)
    missing = [name for name in agent_contributions if name not in agent_results]
    if missing:
        raise KeyError(f"agent_results is missing entries fusion_result already used: {missing}")

    rules_fired = build_rules_fired(
        agent_results, fusion_result, agent_contributions, tier_before, tier_after
    )

    return RiskAssessmentJustification(
        schema_version=JUSTIFICATION_SCHEMA_VERSION,
        rules_fired=rules_fired,
        agent_contributions=agent_contributions,
        interaction_bonus_applied=fusion_result.interaction_bonus_applied,
        tier_before=tier_before,
        tier_after=tier_after,
    )
