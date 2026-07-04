import { describe, expect, it } from "vitest";

import type { RiskJustification } from "./justification";
import { hasInteractionBonus, isIgnoredByThresholdEngine, rankContributingFactors } from "./rootCause";

function justification(overrides: Partial<RiskJustification> = {}): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired: [],
    agentContributions: {},
    interactionBonusApplied: 1.0,
    tierBefore: "normal",
    tierAfter: "normal",
    ...overrides,
  };
}

describe("rankContributingFactors", () => {
  it("returns an empty list when justification is null", () => {
    expect(rankContributingFactors(null)).toEqual([]);
  });

  it("sorts agents by risk descending", () => {
    const ranked = rankContributingFactors(
      justification({
        agentContributions: {
          gas_risk: { risk: 40, confidence: 0.3 },
          permit_intelligence: { risk: 90, confidence: 0.3 },
          equipment_status: { risk: 65, confidence: 1.0 },
        },
      }),
    );
    expect(ranked.map((f) => f.agentName)).toEqual([
      "permit_intelligence",
      "equipment_status",
      "gas_risk",
    ]);
  });

  it("attaches a human-readable display name", () => {
    const ranked = rankContributingFactors(
      justification({ agentContributions: { gas_risk: { risk: 10, confidence: 1 } } }),
    );
    expect(ranked[0].displayName).toBe("Gas Risk");
  });
});

describe("hasInteractionBonus", () => {
  it("is true only when the rule identifier is present", () => {
    expect(
      hasInteractionBonus(justification({ rulesFired: ["interaction_bonus_applied"] })),
    ).toBe(true);
    expect(hasInteractionBonus(justification({ rulesFired: ["tier_stable"] }))).toBe(false);
  });

  it("is false for a 1.0 (neutral) multiplier even without checking the value directly", () => {
    expect(
      hasInteractionBonus(justification({ rulesFired: [], interactionBonusApplied: 1.0 })),
    ).toBe(false);
  });

  it("is false when justification is null", () => {
    expect(hasInteractionBonus(null)).toBe(false);
  });
});

describe("isIgnoredByThresholdEngine", () => {
  it("is false for gas_risk - the only agent the naive engine reads", () => {
    expect(isIgnoredByThresholdEngine("gas_risk")).toBe(false);
  });

  it("is true for every other agent", () => {
    expect(isIgnoredByThresholdEngine("worker_exposure")).toBe(true);
    expect(isIgnoredByThresholdEngine("equipment_status")).toBe(true);
    expect(isIgnoredByThresholdEngine("permit_intelligence")).toBe(true);
  });
});
