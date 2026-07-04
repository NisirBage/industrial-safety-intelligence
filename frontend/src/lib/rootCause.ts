import { agentDisplayName, type RiskJustification } from "./justification";

/**
 * Item 3 (Root Cause Explorer) - "top contributing factors... ordered
 * by contribution." A pure sort over the same `agent_contributions`
 * the Decision Graph's own agent nodes already render - never a new
 * weighting or recomputation, just an ordering.
 */
export interface RankedFactor {
  agentName: string;
  displayName: string;
  risk: number;
  confidence: number;
}

export function rankContributingFactors(justification: RiskJustification | null): RankedFactor[] {
  if (!justification) {
    return [];
  }
  return Object.entries(justification.agentContributions)
    .map(([agentName, contribution]) => ({
      agentName,
      displayName: agentDisplayName(agentName),
      risk: contribution.risk,
      confidence: contribution.confidence,
    }))
    .sort((a, b) => b.risk - a.risk);
}

/** Agent names the naive Counterfactual Comparator structurally never
 * reads - it is, by its own frozen design (docs/algorithms/
 * counterfactual.md), a hard trip point against a single gas sensor
 * reading only. This is not data-dependent (it never changes tick to
 * tick); it names a fixed architectural fact about the frozen
 * Counterfactual model, not something derived from any one
 * assessment. */
const IGNORED_BY_THRESHOLD_ENGINE = new Set([
  "worker_exposure",
  "equipment_status",
  "permit_intelligence",
]);

export function isIgnoredByThresholdEngine(agentName: string): boolean {
  return IGNORED_BY_THRESHOLD_ENGINE.has(agentName);
}

/** Whether Fusion actually applied an interaction bonus this tick -
 * matches the backend's own condition exactly (`rules_fired` contains
 * `"interaction_bonus_applied"`, appended only when the multiplier is
 * `> 1.0`), never `interactionBonusApplied > 1` directly (a `1.0`
 * multiplier is the neutral/no-bonus value, not zero). */
export function hasInteractionBonus(justification: RiskJustification | null): boolean {
  return justification?.rulesFired.includes("interaction_bonus_applied") ?? false;
}
