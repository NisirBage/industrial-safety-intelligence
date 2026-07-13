import type { Tier } from "../api/types";
import type { RiskJustification } from "./justification";

/**
 * Item 8 (recommendation engine) - "based entirely on existing
 * justification outputs. No new AI or ML." Every entry below maps an
 * already-computed, already-persisted categorical output (the tier
 * the frozen Tiering module decided, or a rule identifier one of the
 * frozen agents/Fusion already fired) to a canned action phrase. This
 * is a lookup table, not a model: it derives nothing from raw sensor
 * values, applies no threshold of its own, and recomputes no risk
 * score. Rule identifiers below are copied verbatim from their
 * source (src/domain/agents/*.py, risk_formula.py, scheduler.py) -
 * see each rule's own docstring there for what it means.
 */

export interface Recommendation {
  id: string;
  text: string;
  severity: "critical" | "high" | "medium";
}

const TIER_BASELINE: Partial<Record<Tier, Recommendation>> = {
  critical: {
    id: "tier_critical",
    text: "Escalate immediately: evacuate non-essential personnel from this zone and notify the shift supervisor.",
    severity: "critical",
  },
  elevated: {
    id: "tier_elevated",
    text: "Increase monitoring frequency and confirm response readiness for this zone.",
    severity: "high",
  },
  watch: {
    id: "tier_watch",
    text: "Log this zone for closer observation; no immediate action required yet.",
    severity: "medium",
  },
};

const RULE_RECOMMENDATIONS: Record<string, Recommendation> = {
  unauthorized_presence: {
    id: "unauthorized_presence",
    text: "Verify headcount and remove unauthorized personnel operating without an active permit.",
    severity: "high",
  },
  permit_status_escalated: {
    id: "permit_status_escalated",
    text: "Review the active permit in this zone for suspension or revocation.",
    severity: "high",
  },
  common_cause_grouped_degradation_count: {
    id: "common_cause_grouped_degradation_count",
    text: "Inspect equipment flagged under common-cause degradation before continuing operations.",
    severity: "medium",
  },
  stale_data_fail_safe: {
    id: "stale_data_fail_safe",
    text: "Sensor data is stale for this zone - dispatch a technician to confirm sensor health.",
    severity: "medium",
  },
  missing_data_fail_safe: {
    id: "missing_data_fail_safe",
    text: "No sensor data is reaching this zone - treat as an instrumentation failure until confirmed otherwise.",
    severity: "high",
  },
  missing_location_fail_safe: {
    id: "missing_location_fail_safe",
    text: "Worker location data is unavailable for this zone - confirm headcount manually.",
    severity: "medium",
  },
  missing_equipment_context: {
    id: "missing_equipment_context",
    text: "Equipment telemetry is unavailable for this zone - confirm equipment status manually.",
    severity: "medium",
  },
  agent_unavailable_using_last_known: {
    id: "agent_unavailable_using_last_known",
    text: "One or more risk agents used stale/last-known data this tick - confirm all upstream systems are reporting.",
    severity: "medium",
  },
  interaction_bonus_applied: {
    id: "interaction_bonus_applied",
    text: "Multiple independent risk factors are compounding in this zone (SIMOPS) - review concurrent activity.",
    severity: "high",
  },
};

/** M27 Part 3 (Enterprise Search) - the static recommendation
 * vocabulary (tier baselines + rule-keyed templates), for searching
 * recommendation *text*, not a specific tick's instance. Deduplicated
 * since `RULE_RECOMMENDATIONS` and `TIER_BASELINE` never share an id. */
export const ALL_RECOMMENDATION_TEMPLATES: Recommendation[] = [
  ...Object.values(TIER_BASELINE),
  ...Object.values(RULE_RECOMMENDATIONS),
];

/** One baseline recommendation for the tier (if any - "normal" has
 * none), plus one recommendation per distinct recognized rule in
 * `rulesFired`, in the order the rules themselves fired. Unrecognized
 * rule identifiers are silently skipped rather than guessed at. */
export function deriveRecommendations(
  tier: Tier,
  justification: RiskJustification | null,
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  const baseline = TIER_BASELINE[tier];
  if (baseline) {
    recommendations.push(baseline);
  }

  if (justification) {
    for (const rule of justification.rulesFired) {
      const recommendation = RULE_RECOMMENDATIONS[rule];
      if (recommendation && !recommendations.some((r) => r.id === recommendation.id)) {
        recommendations.push(recommendation);
      }
    }
  }

  return recommendations;
}
