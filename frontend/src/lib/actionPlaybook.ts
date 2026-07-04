import { hasInteractionBonus, rankContributingFactors } from "./rootCause";
import type { RiskJustification } from "./justification";
import type { Recommendation } from "./recommendations";

/**
 * Six qualitative levels, never a number - the Operations Center
 * shows "how urgent", never "risk drops from X to Y" (the
 * deterministic engine has no concept of a hypothetical post-action
 * score; see docs/architecture/operations_center.md's Known
 * Limitations for why one is not synthesized here).
 */
export type ImpactLevel = "CRITICAL" | "VERY HIGH" | "HIGH" | "MODERATE" | "LOW" | "INFORMATIONAL";

const IMPACT_ORDER: ImpactLevel[] = [
  "INFORMATIONAL",
  "LOW",
  "MODERATE",
  "HIGH",
  "VERY HIGH",
  "CRITICAL",
];

function escalate(level: ImpactLevel): ImpactLevel {
  const index = IMPACT_ORDER.indexOf(level);
  return IMPACT_ORDER[Math.min(index + 1, IMPACT_ORDER.length - 1)];
}

/**
 * Item 2/3/7 (Operations Center) - operational metadata for each of
 * the deterministic recommendation ids `lib/recommendations.ts`
 * already produces. This is configuration, not reasoning: ETA,
 * dependencies, and required personnel/equipment are authored
 * procedural facts about how a plant actually executes each action
 * (the same kind of fixed lookup `TIER_BASELINE`/
 * `RULE_RECOMMENDATIONS` already are), never derived from - and never
 * feeding back into - the deterministic risk engine. `dependsOn`
 * references other recommendation ids in this same table and drives
 * both the Action Queue's "Dependencies" field and the Operational
 * Dependency Graph's edges, so the two views can never disagree with
 * each other.
 */
export interface ActionPlaybookEntry {
  eta: string;
  dependsOn: string[];
  requiredPersonnel: string;
  requiredEquipment: string | null;
  /** Which `agent_contributions` key (or `"interaction_bonus"` /
   * `"tier"`) this action primarily addresses - used to show which
   * real, already-persisted number this action targets, instead of a
   * fabricated "risk drops from X to Y" projection the deterministic
   * engine never computes for any hypothetical action. */
  targetedFactor: string;
  /** Baseline urgency for this action type, authored once here -
   * escalated by one rung at render time (`computeImpactLevel`) only
   * when this tick's own persisted `rules_fired`/`agent_contributions`
   * show the targeted factor is actually part of the current
   * interaction bonus, never a fixed property of the action alone. */
  baseImpact: ImpactLevel;
}

export const ACTION_PLAYBOOK: Record<string, ActionPlaybookEntry> = {
  tier_critical: {
    eta: "2 minutes",
    dependsOn: [],
    requiredPersonnel: "Shift Supervisor, Safety Officer",
    requiredEquipment: null,
    targetedFactor: "tier",
    baseImpact: "CRITICAL",
  },
  tier_elevated: {
    eta: "1 minute",
    dependsOn: [],
    requiredPersonnel: "Control Room Operator",
    requiredEquipment: null,
    targetedFactor: "tier",
    baseImpact: "HIGH",
  },
  tier_watch: {
    eta: "immediate",
    dependsOn: [],
    requiredPersonnel: "Control Room Operator",
    requiredEquipment: null,
    targetedFactor: "tier",
    baseImpact: "LOW",
  },
  permit_status_escalated: {
    eta: "30 seconds",
    dependsOn: [],
    requiredPersonnel: "Permit Authorizing Officer",
    requiredEquipment: null,
    targetedFactor: "permit_intelligence",
    baseImpact: "HIGH",
  },
  unauthorized_presence: {
    eta: "3 minutes",
    dependsOn: ["permit_status_escalated"],
    requiredPersonnel: "Safety Officer",
    requiredEquipment: null,
    targetedFactor: "worker_exposure",
    baseImpact: "HIGH",
  },
  interaction_bonus_applied: {
    eta: "1 minute",
    dependsOn: ["permit_status_escalated"],
    requiredPersonnel: "Shift Supervisor",
    requiredEquipment: null,
    targetedFactor: "interaction_bonus",
    baseImpact: "VERY HIGH",
  },
  common_cause_grouped_degradation_count: {
    eta: "10 minutes",
    dependsOn: ["unauthorized_presence"],
    requiredPersonnel: "Maintenance Technician",
    requiredEquipment: "Isolation tools",
    targetedFactor: "equipment_status",
    baseImpact: "MODERATE",
  },
  stale_data_fail_safe: {
    eta: "5 minutes",
    dependsOn: [],
    requiredPersonnel: "Instrumentation Technician",
    requiredEquipment: "Calibration kit",
    targetedFactor: "gas_risk",
    baseImpact: "INFORMATIONAL",
  },
  missing_data_fail_safe: {
    eta: "5 minutes",
    dependsOn: [],
    requiredPersonnel: "Instrumentation Technician",
    requiredEquipment: "Calibration kit",
    targetedFactor: "gas_risk",
    baseImpact: "MODERATE",
  },
  missing_location_fail_safe: {
    eta: "5 minutes",
    dependsOn: [],
    requiredPersonnel: "Safety Officer",
    requiredEquipment: null,
    targetedFactor: "worker_exposure",
    baseImpact: "MODERATE",
  },
  missing_equipment_context: {
    eta: "5 minutes",
    dependsOn: ["common_cause_grouped_degradation_count"],
    requiredPersonnel: "Maintenance Technician",
    requiredEquipment: null,
    targetedFactor: "equipment_status",
    baseImpact: "INFORMATIONAL",
  },
  agent_unavailable_using_last_known: {
    eta: "5 minutes",
    dependsOn: [],
    requiredPersonnel: "Control Room Operator",
    requiredEquipment: null,
    targetedFactor: "tier",
    baseImpact: "INFORMATIONAL",
  },
};

const FALLBACK_ENTRY: ActionPlaybookEntry = {
  eta: "unspecified",
  dependsOn: [],
  requiredPersonnel: "Shift Supervisor",
  requiredEquipment: null,
  targetedFactor: "tier",
  baseImpact: "MODERATE",
};

/** Never throws on an id this table doesn't recognize - falls back to
 * a generic, clearly-unspecified entry rather than crashing the
 * queue over a future recommendation id this config hasn't been
 * updated for yet. */
export function getActionMetadata(recommendationId: string): ActionPlaybookEntry {
  return ACTION_PLAYBOOK[recommendationId] ?? FALLBACK_ENTRY;
}

/**
 * Escalates an action's baseline urgency by exactly one rung when
 * this tick's own persisted fields show its targeted factor is
 * actually part of the current interaction bonus - never a numeric
 * computation, a single disclosed categorical rule over fields the
 * frozen engine already produced:
 *
 * - `targetedFactor === "interaction_bonus"` escalates whenever
 *   `rules_fired` actually contains `interaction_bonus_applied` this
 *   tick (the action IS about the bonus, so it tracks it exactly).
 * - Any other `targetedFactor` escalates only when a bonus is applied
 *   AND that same factor is one of this tick's two highest-ranked
 *   contributing agents (`rankContributingFactors`) - i.e. it was
 *   actually one of the compounding factors, not merely present.
 */
export function computeImpactLevel(
  entry: ActionPlaybookEntry,
  justification: RiskJustification | null,
): ImpactLevel {
  const bonusApplied = hasInteractionBonus(justification);
  if (!bonusApplied) {
    return entry.baseImpact;
  }

  if (entry.targetedFactor === "interaction_bonus") {
    return escalate(entry.baseImpact);
  }

  const topTwo = rankContributingFactors(justification)
    .slice(0, 2)
    .map((factor) => factor.agentName);
  if (topTwo.includes(entry.targetedFactor)) {
    return escalate(entry.baseImpact);
  }

  return entry.baseImpact;
}

export interface PrioritizedAction extends Recommendation {
  priority: number;
  metadata: ActionPlaybookEntry;
  impactLevel: ImpactLevel;
  /** Human-readable labels for this action's own `dependsOn` ids,
   * restricted to whichever of those dependencies are actually in the
   * current queue (a dependency that isn't currently recommended
   * isn't "pending" - it's simply not applicable this tick). */
  dependencyLabels: string[];
}

/** Attaches priority rank + playbook metadata + this tick's impact
 * level to `deriveRecommendations`'s output - `recommendations` is
 * assumed already ordered by severity (the order `deriveRecommendations`
 * returns), so priority is purely positional, not a new ranking. */
export function buildActionQueue(
  recommendations: Recommendation[],
  justification: RiskJustification | null,
): PrioritizedAction[] {
  const presentIds = new Set(recommendations.map((r) => r.id));
  return recommendations.map((recommendation, index) => {
    const metadata = getActionMetadata(recommendation.id);
    return {
      ...recommendation,
      priority: index + 1,
      metadata,
      impactLevel: computeImpactLevel(metadata, justification),
      dependencyLabels: metadata.dependsOn.filter((id) => presentIds.has(id)),
    };
  });
}
