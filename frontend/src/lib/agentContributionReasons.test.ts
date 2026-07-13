import { describe, expect, it } from "vitest";

import type { RiskJustification } from "./justification";
import { buildAgentContributionReason, formatAgentContributionWithReason } from "./agentContributionReasons";

function justification(rulesFired: string[]): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired,
    agentContributions: {
      gas_risk: { risk: 82.5, confidence: 0.9 },
      equipment_status: { risk: 0, confidence: 1.0 },
    },
    interactionBonusApplied: 0,
    tierBefore: "watch",
    tierAfter: "elevated",
  };
}

describe("buildAgentContributionReason", () => {
  it("explains a fired rule attributed to that agent", () => {
    const j = justification(["saturating_threshold_function"]);
    const reason = buildAgentContributionReason("gas_risk", j.agentContributions.gas_risk, j);
    expect(reason).toContain("Gas concentration relative to its alarm threshold");
  });

  it("adds a confidence caveat when a fail-safe rule fired", () => {
    const j = justification(["missing_data_fail_safe"]);
    const reason = buildAgentContributionReason("gas_risk", j.agentContributions.gas_risk, j);
    expect(reason).toContain("fail-safe elevated risk floor");
    expect(reason).toContain("confidence reduced to 90%");
  });

  it("falls back to a risk/confidence statement when no rule is attributed to this agent but risk is nonzero", () => {
    const j = justification(["tier_escalated"]);
    const reason = buildAgentContributionReason("gas_risk", j.agentContributions.gas_risk, j);
    expect(reason).toContain("Risk score 82.5");
    expect(reason).toContain("no fail-safe or escalation rule fired");
  });

  it("reports no contribution when risk is zero and no rule fired", () => {
    const j = justification(["tier_escalated"]);
    const reason = buildAgentContributionReason("equipment_status", j.agentContributions.equipment_status, j);
    expect(reason).toBe("No risk contribution and no rule fired for this agent this tick.");
  });

  it("falls back to the risk-based statement for a rule id this agent's stage map doesn't recognize", () => {
    const j = justification(["some_future_rule_not_yet_mapped"]);
    const reason = buildAgentContributionReason("gas_risk", j.agentContributions.gas_risk, j);
    expect(reason).toContain("Risk score 82.5");
  });
});

describe("formatAgentContributionWithReason", () => {
  it("matches the milestone's own example format", () => {
    const j = justification(["saturating_threshold_function"]);
    const formatted = formatAgentContributionWithReason("gas_risk", j.agentContributions.gas_risk, j);
    expect(formatted).toMatch(/^Gas Risk 8[23]% - Reason: /);
  });
});
