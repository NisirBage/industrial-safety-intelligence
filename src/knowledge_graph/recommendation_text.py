"""A verbatim mirror of `frontend/src/lib/recommendations.ts`'s two
frozen lookup constants (`TIER_BASELINE`, `RULE_RECOMMENDATIONS`),
copied by hand from that file - not reimplemented, not re-derived.

This exists ONLY so the Operational Knowledge Graph can enumerate real
Recommendation nodes (which ids exist for a given tier/rules_fired,
what their text and severity are) without asking the frontend first.
It must never be used to compute or override a recommendation
independently: `deriveRecommendations` in the TypeScript file remains
the single frozen source of truth for what a user actually sees
rendered as "the recommendation" anywhere else in this app. If the two
ever drift, `recommendations.ts` wins - this file should be updated to
match it, never the other way around.

This is the same kind of cross-language constant mirror this codebase
already relies on everywhere a Python backend and a TypeScript
frontend must agree on a fixed vocabulary (`Tier`/`RISK_TIERS`, the 21
real rule identifiers, agent names) - a data mirror, not a second
implementation of a decision.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RecommendationTemplate:
    id: str
    text: str
    severity: str  # "critical" | "high" | "medium"


#: Mirrors `recommendations.ts`'s `TIER_BASELINE` - one entry per tier
#: that has a baseline recommendation ("normal" deliberately has none).
TIER_BASELINE: dict[str, RecommendationTemplate] = {
    "critical": RecommendationTemplate(
        id="tier_critical",
        text=(
            "Escalate immediately: evacuate non-essential personnel from this "
            "zone and notify the shift supervisor."
        ),
        severity="critical",
    ),
    "elevated": RecommendationTemplate(
        id="tier_elevated",
        text="Increase monitoring frequency and confirm response readiness for this zone.",
        severity="high",
    ),
    "watch": RecommendationTemplate(
        id="tier_watch",
        text="Log this zone for closer observation; no immediate action required yet.",
        severity="medium",
    ),
}

#: Mirrors `recommendations.ts`'s `RULE_RECOMMENDATIONS` - keyed by
#: the same real rule identifiers `rules_fired` ever contains.
RULE_RECOMMENDATIONS: dict[str, RecommendationTemplate] = {
    "unauthorized_presence": RecommendationTemplate(
        id="unauthorized_presence",
        text=(
            "Verify headcount and remove unauthorized personnel operating "
            "without an active permit."
        ),
        severity="high",
    ),
    "permit_status_escalated": RecommendationTemplate(
        id="permit_status_escalated",
        text="Review the active permit in this zone for suspension or revocation.",
        severity="high",
    ),
    "common_cause_grouped_degradation_count": RecommendationTemplate(
        id="common_cause_grouped_degradation_count",
        text=(
            "Inspect equipment flagged under common-cause degradation before "
            "continuing operations."
        ),
        severity="medium",
    ),
    "stale_data_fail_safe": RecommendationTemplate(
        id="stale_data_fail_safe",
        text="Sensor data is stale for this zone - dispatch a technician to confirm sensor health.",
        severity="medium",
    ),
    "missing_data_fail_safe": RecommendationTemplate(
        id="missing_data_fail_safe",
        text=(
            "No sensor data is reaching this zone - treat as an instrumentation "
            "failure until confirmed otherwise."
        ),
        severity="high",
    ),
    "missing_location_fail_safe": RecommendationTemplate(
        id="missing_location_fail_safe",
        text="Worker location data is unavailable for this zone - confirm headcount manually.",
        severity="medium",
    ),
    "missing_equipment_context": RecommendationTemplate(
        id="missing_equipment_context",
        text=(
            "Equipment telemetry is unavailable for this zone - confirm "
            "equipment status manually."
        ),
        severity="medium",
    ),
    "agent_unavailable_using_last_known": RecommendationTemplate(
        id="agent_unavailable_using_last_known",
        text=(
            "One or more risk agents used stale/last-known data this tick - "
            "confirm all upstream systems are reporting."
        ),
        severity="medium",
    ),
    "interaction_bonus_applied": RecommendationTemplate(
        id="interaction_bonus_applied",
        text=(
            "Multiple independent risk factors are compounding in this zone "
            "(SIMOPS) - review concurrent activity."
        ),
        severity="high",
    ),
}


def recommendation_templates_for(tier: str, rules_fired: list[str]) -> list[RecommendationTemplate]:
    """Same order/de-duplication rule as `deriveRecommendations`: the
    tier baseline (if any) first, then one entry per distinct
    recognized rule id in the order it fired."""
    templates: list[RecommendationTemplate] = []

    baseline = TIER_BASELINE.get(tier)
    if baseline is not None:
        templates.append(baseline)

    seen_ids = {t.id for t in templates}
    for rule in rules_fired:
        template = RULE_RECOMMENDATIONS.get(rule)
        if template is not None and template.id not in seen_ids:
            templates.append(template)
            seen_ids.add(template.id)

    return templates


__all__ = [
    "RecommendationTemplate",
    "TIER_BASELINE",
    "RULE_RECOMMENDATIONS",
    "recommendation_templates_for",
]
