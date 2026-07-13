import { agentDisplayName, type AgentContribution, type RiskJustification } from "./justification";
import { agentStage, groupRulesByStage } from "./pipelineStages";

/**
 * M28 Part 9 (Explainability Improvements) - "every contribution must
 * explain WHY". The frontend only ever receives each agent's `risk`/
 * `confidence` (`AgentContribution`) plus the assessment's flat,
 * already-deduplicated `rulesFired` list - the richer per-agent
 * `summary`/`evidence` text each backend agent computes
 * (`src/domain/agents/*.py::build_justification`) is never persisted
 * past the agent boundary (see `src/domain/orchestrator/justification.py`),
 * so it cannot be surfaced here without a schema change, which this
 * milestone's freeze explicitly forbids. Every sentence below is
 * therefore built only from: which of that agent's own real rule ids
 * fired this tick (attributed via `pipelineStages.ts`'s existing
 * `RULE_STAGE` map - not re-derived here), and the risk/confidence
 * numbers already displayed everywhere else. Nothing here is invented
 * or recomputed.
 */

/** One clause per real rule id, grounded in what that rule's own
 * agent code does when it fires (see each agent's docstring/threshold
 * constants in `src/domain/agents/*.py`). Never cites a specific
 * numeric threshold or percentage the frontend doesn't actually have
 * on this tick - only the real, already-implemented behavior. */
const RULE_SENTENCES: Record<string, string> = {
  agent_unavailable_using_last_known: "An agent was unavailable this tick; its last known output was reused.",
  missing_data_fail_safe: "Sensor reading was missing; the agent fell back to a fail-safe elevated risk floor.",
  stale_data_fail_safe: "Sensor reading was stale; risk was decayed toward a fail-safe floor rather than zero.",
  saturating_threshold_function: "Gas concentration relative to its alarm threshold drove this risk score.",
  insufficient_history: "Not enough historical readings were available to fit a trend, so a conservative estimate was used.",
  missing_equipment_context: "No equipment inventory was available for this zone; a low-confidence fallback was used.",
  confirmed_empty_inventory: "Equipment inventory was confirmed empty for this zone.",
  no_degradation: "No equipment type in this zone showed isolation, degradation, or LOTO flags.",
  common_cause_grouped_degradation_count: "Multiple equipment items of the same type showed degradation, isolation, or LOTO flags.",
  missing_location_fail_safe: "Worker location data was unavailable; a fail-safe assumed occupancy was used.",
  exposure_weighted_headcount: "Worker headcount was weighted by the zone's current risk tier.",
  unauthorized_presence: "Workers were present with an elevated or higher gas risk and no active permit authorizing entry.",
  fail_open_never: "No permit context was available; this agent never fails open, so an escalated risk was assumed.",
  no_open_permits: "No open permits exist for this zone.",
  permit_status_escalated: "A permit's status escalated - risk exceeded its baseline, or a SIMOPS conflict was detected.",
  permits_within_policy: "All open permits remain within policy.",
  weighted_sum_fusion: "Agent risks were combined via the fusion formula's weighted sum.",
  interaction_bonus_applied: "An interaction bonus was applied because multiple agents were simultaneously elevated.",
  tier_stable: "The risk tier held steady from the previous tick.",
  tier_escalated: "The risk tier escalated from the previous tick.",
  tier_de_escalated: "The risk tier de-escalated from the previous tick.",
};

/** Rules this agent's own fail-safe/context-missing behavior fired -
 * worth calling out because they explain a *low-confidence* number,
 * not just a risk number. */
const CONFIDENCE_CAVEAT_RULES = new Set([
  "missing_data_fail_safe",
  "stale_data_fail_safe",
  "insufficient_history",
  "missing_equipment_context",
  "missing_location_fail_safe",
  "fail_open_never",
]);

/** Builds the one-sentence (or short multi-clause) "Reason: ..." text
 * for a single agent's contribution this tick, from only its own
 * fired rules (per `pipelineStages.ts`'s existing stage attribution)
 * plus the risk/confidence value the caller already has. */
export function buildAgentContributionReason(
  agentName: string,
  contribution: AgentContribution,
  justification: RiskJustification,
): string {
  const stage = agentStage(agentName);
  const ownRules = groupRulesByStage(justification.rulesFired).find((s) => s.stage === stage)?.rules ?? [];

  if (ownRules.length === 0) {
    return contribution.risk > 0
      ? `Risk score ${contribution.risk.toFixed(1)} at ${(contribution.confidence * 100).toFixed(0)}% confidence; no fail-safe or escalation rule fired for this agent this tick.`
      : "No risk contribution and no rule fired for this agent this tick.";
  }

  const sentences = ownRules.map((rule) => RULE_SENTENCES[rule] ?? `Rule "${rule}" fired.`);
  const hasConfidenceCaveat = ownRules.some((rule) => CONFIDENCE_CAVEAT_RULES.has(rule));
  const confidenceNote = hasConfidenceCaveat
    ? ` (confidence reduced to ${(contribution.confidence * 100).toFixed(0)}% accordingly)`
    : "";
  return `${sentences.join(" ")}${confidenceNote}`;
}

/** Convenience wrapper matching the milestone's own example format:
 * "Gas Agent 22% - Reason: ...". */
export function formatAgentContributionWithReason(
  agentName: string,
  contribution: AgentContribution,
  justification: RiskJustification,
): string {
  return `${agentDisplayName(agentName)} ${contribution.risk.toFixed(0)}% - Reason: ${buildAgentContributionReason(agentName, contribution, justification)}`;
}
