/**
 * Typed view onto `RiskAssessment.justification` - the API only
 * types this field as `Record<string, unknown>` (it's a JSON column,
 * see src/infra/db/models/risk_assessment.py), so this file is the
 * one place that trusts it matches the frozen
 * `RiskAssessmentJustification` contract (src/domain/orchestrator/justification.py)
 * and defensively parses rather than casts.
 */

export interface AgentContribution {
  risk: number;
  confidence: number;
}

export interface RiskJustification {
  schemaVersion: number;
  rulesFired: string[];
  agentContributions: Record<string, AgentContribution>;
  interactionBonusApplied: number;
  tierBefore: string;
  tierAfter: string;
}

function isAgentContribution(value: unknown): value is AgentContribution {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.risk === "number" && typeof record.confidence === "number";
}

/** Returns `null` rather than throwing when the shape doesn't match -
 * older or hand-crafted rows (e.g. test fixtures) may not carry the
 * full contract, and this is a read-only explanatory view, not
 * something that should crash the page over it. */
export function parseJustification(raw: Record<string, unknown>): RiskJustification | null {
  const { schema_version, rules_fired, agent_contributions, interaction_bonus_applied, tier_before, tier_after } =
    raw as Record<string, unknown>;

  if (
    typeof schema_version !== "number" ||
    !Array.isArray(rules_fired) ||
    typeof agent_contributions !== "object" ||
    agent_contributions === null ||
    typeof interaction_bonus_applied !== "number" ||
    typeof tier_before !== "string" ||
    typeof tier_after !== "string"
  ) {
    return null;
  }

  const contributions = agent_contributions as Record<string, unknown>;
  const agentContributions: Record<string, AgentContribution> = {};
  for (const [agentName, contribution] of Object.entries(contributions)) {
    if (!isAgentContribution(contribution)) {
      return null;
    }
    agentContributions[agentName] = contribution;
  }

  return {
    schemaVersion: schema_version,
    rulesFired: rules_fired.filter((rule): rule is string => typeof rule === "string"),
    agentContributions,
    interactionBonusApplied: interaction_bonus_applied,
    tierBefore: tier_before,
    tierAfter: tier_after,
  };
}

/** Cosmetic only - "gas_risk" -> "Gas Risk". Never used to decide
 * anything, only to render the agent name the backend already sent. */
export function agentDisplayName(agentName: string): string {
  return agentName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
