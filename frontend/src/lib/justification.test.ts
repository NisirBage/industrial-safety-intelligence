import { describe, expect, it } from "vitest";

import { agentDisplayName, parseJustification } from "./justification";

const validRaw = {
  schema_version: 1,
  rules_fired: ["gas_risk_elevated", "tier_escalated"],
  agent_contributions: {
    gas_risk: { risk: 82.5, confidence: 0.9 },
    permit_intelligence: { risk: 40.0, confidence: 1.0 },
  },
  interaction_bonus_applied: 12.5,
  tier_before: "watch",
  tier_after: "elevated",
};

describe("parseJustification", () => {
  it("parses a well-formed justification payload", () => {
    const result = parseJustification(validRaw);
    expect(result).not.toBeNull();
    expect(result?.tierBefore).toBe("watch");
    expect(result?.tierAfter).toBe("elevated");
    expect(result?.agentContributions.gas_risk).toEqual({ risk: 82.5, confidence: 0.9 });
    expect(result?.rulesFired).toEqual(["gas_risk_elevated", "tier_escalated"]);
  });

  it("returns null when a required field is missing", () => {
    const { tier_after: _tier_after, ...incomplete } = validRaw;
    expect(parseJustification(incomplete)).toBeNull();
  });

  it("returns null when an agent contribution is malformed", () => {
    const malformed = {
      ...validRaw,
      agent_contributions: { gas_risk: { risk: "high" } },
    };
    expect(parseJustification(malformed)).toBeNull();
  });

  it("returns null for a sparse fixture like { schema_version: 1 }", () => {
    expect(parseJustification({ schema_version: 1 })).toBeNull();
  });
});

describe("agentDisplayName", () => {
  it("title-cases each underscore-separated word", () => {
    expect(agentDisplayName("gas_risk")).toBe("Gas Risk");
    expect(agentDisplayName("permit_intelligence")).toBe("Permit Intelligence");
  });
});
