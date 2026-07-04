/**
 * Item 10 (research mode) - which pipeline stage fired each rule in
 * `rules_fired`. Grounded directly in where each string literal is
 * appended in the backend: src/domain/agents/{gas_risk,
 * equipment_status, worker_exposure, permit_intelligence}.py, Fusion
 * (risk_formula.py), the Scheduler's fallback path (scheduler.py),
 * and the one tier-transition rule Justification Builder itself
 * derives (justification.py's `determine_tier_transition_rule`).
 * This is a lookup table for display grouping only - it never
 * decides which rules fire, only labels ones the backend already did.
 */

export type PipelineStage =
  | "Scheduler"
  | "Gas Risk Agent"
  | "Equipment Status Agent"
  | "Worker Exposure Agent"
  | "Permit Intelligence Agent"
  | "Fusion"
  | "Tiering"
  | "Unattributed";

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "Scheduler",
  "Gas Risk Agent",
  "Equipment Status Agent",
  "Worker Exposure Agent",
  "Permit Intelligence Agent",
  "Fusion",
  "Tiering",
  "Unattributed",
];

const RULE_STAGE: Record<string, PipelineStage> = {
  agent_unavailable_using_last_known: "Scheduler",
  missing_data_fail_safe: "Gas Risk Agent",
  stale_data_fail_safe: "Gas Risk Agent",
  saturating_threshold_function: "Gas Risk Agent",
  insufficient_history: "Gas Risk Agent",
  missing_equipment_context: "Equipment Status Agent",
  confirmed_empty_inventory: "Equipment Status Agent",
  no_degradation: "Equipment Status Agent",
  common_cause_grouped_degradation_count: "Equipment Status Agent",
  missing_location_fail_safe: "Worker Exposure Agent",
  exposure_weighted_headcount: "Worker Exposure Agent",
  unauthorized_presence: "Worker Exposure Agent",
  fail_open_never: "Permit Intelligence Agent",
  no_open_permits: "Permit Intelligence Agent",
  permit_status_escalated: "Permit Intelligence Agent",
  permits_within_policy: "Permit Intelligence Agent",
  weighted_sum_fusion: "Fusion",
  interaction_bonus_applied: "Fusion",
  tier_stable: "Tiering",
  tier_escalated: "Tiering",
  tier_de_escalated: "Tiering",
};

export interface StageRules {
  stage: PipelineStage;
  rules: string[];
}

/** Groups an already-deduplicated `rules_fired` list by originating
 * stage, in pipeline order. Any rule identifier this map doesn't
 * recognize (e.g. a future agent's new rule) is grouped under
 * "Unattributed" rather than dropped, so nothing the backend actually
 * fired is ever silently hidden by an out-of-date lookup table. */
export function groupRulesByStage(rulesFired: string[]): StageRules[] {
  const buckets = new Map<PipelineStage, string[]>();
  for (const rule of rulesFired) {
    const stage = RULE_STAGE[rule] ?? "Unattributed";
    const bucket = buckets.get(stage) ?? [];
    bucket.push(rule);
    buckets.set(stage, bucket);
  }
  return PIPELINE_STAGE_ORDER.filter((stage) => buckets.has(stage)).map((stage) => ({
    stage,
    rules: buckets.get(stage) as string[],
  }));
}

const AGENT_NAME_TO_STAGE: Record<string, PipelineStage> = {
  gas_risk: "Gas Risk Agent",
  equipment_status: "Equipment Status Agent",
  worker_exposure: "Worker Exposure Agent",
  permit_intelligence: "Permit Intelligence Agent",
};

/** Maps an `agent_contributions` key (e.g. "gas_risk") to its stage
 * label, so the same rule-grouping vocabulary can tag an agent card. */
export function agentStage(agentName: string): PipelineStage {
  return AGENT_NAME_TO_STAGE[agentName] ?? "Unattributed";
}
