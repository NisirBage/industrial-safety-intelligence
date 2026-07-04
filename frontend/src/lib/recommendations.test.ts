import { describe, expect, it } from "vitest";

import { deriveRecommendations } from "./recommendations";
import type { RiskJustification } from "./justification";

function justification(rulesFired: string[]): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired,
    agentContributions: {},
    interactionBonusApplied: 0,
    tierBefore: "normal",
    tierAfter: "normal",
  };
}

describe("deriveRecommendations", () => {
  it("returns nothing for a normal tier with no notable rules", () => {
    expect(deriveRecommendations("normal", justification(["no_degradation", "no_open_permits"]))).toEqual(
      [],
    );
  });

  it("includes the tier baseline recommendation for critical", () => {
    const result = deriveRecommendations("critical", justification([]));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tier_critical");
    expect(result[0].severity).toBe("critical");
  });

  it("adds one recommendation per recognized fired rule, in order", () => {
    const result = deriveRecommendations(
      "elevated",
      justification(["unauthorized_presence", "permit_status_escalated"]),
    );
    expect(result.map((r) => r.id)).toEqual([
      "tier_elevated",
      "unauthorized_presence",
      "permit_status_escalated",
    ]);
  });

  it("silently skips unrecognized rule identifiers", () => {
    const result = deriveRecommendations("watch", justification(["some_future_rule_not_yet_mapped"]));
    expect(result.map((r) => r.id)).toEqual(["tier_watch"]);
  });

  it("never duplicates the same recommendation twice", () => {
    const result = deriveRecommendations(
      "critical",
      justification(["unauthorized_presence", "unauthorized_presence"]),
    );
    expect(result.map((r) => r.id)).toEqual(["tier_critical", "unauthorized_presence"]);
  });

  it("returns no baseline for normal tier even with justification present", () => {
    const result = deriveRecommendations("normal", justification(["interaction_bonus_applied"]));
    expect(result.map((r) => r.id)).toEqual(["interaction_bonus_applied"]);
  });
});
