import { describe, expect, it } from "vitest";

import type { RiskJustification } from "./justification";
import type { Recommendation } from "./recommendations";
import { buildActionQueue, computeImpactLevel, getActionMetadata } from "./actionPlaybook";

describe("getActionMetadata", () => {
  it("returns configured metadata for a known recommendation id", () => {
    const metadata = getActionMetadata("permit_status_escalated");
    expect(metadata.eta).toBe("30 seconds");
    expect(metadata.targetedFactor).toBe("permit_intelligence");
    expect(metadata.baseImpact).toBe("HIGH");
  });

  it("falls back to a generic entry for an unrecognized id", () => {
    const metadata = getActionMetadata("some_future_rule");
    expect(metadata.eta).toBe("unspecified");
    expect(metadata.dependsOn).toEqual([]);
  });
});

function justification(overrides: Partial<RiskJustification>): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired: [],
    agentContributions: {},
    interactionBonusApplied: 1.0,
    tierBefore: "watch",
    tierAfter: "watch",
    ...overrides,
  };
}

describe("computeImpactLevel", () => {
  it("returns the baseline impact when no interaction bonus applies", () => {
    const entry = getActionMetadata("common_cause_grouped_degradation_count");
    expect(computeImpactLevel(entry, justification({}))).toBe("MODERATE");
  });

  it("returns the baseline impact when justification is null", () => {
    const entry = getActionMetadata("common_cause_grouped_degradation_count");
    expect(computeImpactLevel(entry, null)).toBe("MODERATE");
  });

  it("always escalates the interaction_bonus_applied action itself when the bonus fired", () => {
    const entry = getActionMetadata("interaction_bonus_applied");
    const j = justification({ rulesFired: ["interaction_bonus_applied"] });
    expect(entry.baseImpact).toBe("VERY HIGH");
    expect(computeImpactLevel(entry, j)).toBe("CRITICAL");
  });

  it("escalates an action whose targeted factor is one of the top-2 contributing agents", () => {
    const entry = getActionMetadata("common_cause_grouped_degradation_count"); // targets equipment_status
    const j = justification({
      rulesFired: ["interaction_bonus_applied"],
      agentContributions: {
        equipment_status: { risk: 90, confidence: 1 },
        gas_risk: { risk: 20, confidence: 0.5 },
      },
    });
    expect(computeImpactLevel(entry, j)).toBe("HIGH"); // MODERATE -> HIGH
  });

  it("does NOT escalate when the targeted factor is not among the top-2 contributors, even with a bonus active", () => {
    const entry = getActionMetadata("common_cause_grouped_degradation_count"); // targets equipment_status
    const j = justification({
      rulesFired: ["interaction_bonus_applied"],
      agentContributions: {
        gas_risk: { risk: 95, confidence: 0.5 },
        worker_exposure: { risk: 90, confidence: 1 },
        equipment_status: { risk: 5, confidence: 1 },
      },
    });
    expect(computeImpactLevel(entry, j)).toBe("MODERATE"); // unchanged - not top-2
  });

  it("never escalates CRITICAL past CRITICAL (capped)", () => {
    const entry = getActionMetadata("tier_critical"); // targets "tier", baseImpact CRITICAL
    const j = justification({
      rulesFired: ["interaction_bonus_applied"],
      agentContributions: { tier: { risk: 100, confidence: 1 } },
    });
    expect(computeImpactLevel(entry, j)).toBe("CRITICAL");
  });
});

describe("buildActionQueue", () => {
  const recs: Recommendation[] = [
    { id: "tier_critical", text: "Evacuate", severity: "critical" },
    { id: "permit_status_escalated", text: "Suspend permit", severity: "high" },
    { id: "unauthorized_presence", text: "Verify headcount", severity: "high" },
  ];

  it("assigns positional priority matching input order", () => {
    const queue = buildActionQueue(recs, null);
    expect(queue.map((a) => a.priority)).toEqual([1, 2, 3]);
  });

  it("attaches an impact level to every action", () => {
    const queue = buildActionQueue(recs, null);
    expect(queue.every((a) => typeof a.impactLevel === "string")).toBe(true);
  });

  it("only lists dependency labels for ids actually present in the queue", () => {
    const queue = buildActionQueue(recs, null);
    const unauthorized = queue.find((a) => a.id === "unauthorized_presence");
    // unauthorized_presence depends on permit_status_escalated, which IS present
    expect(unauthorized?.dependencyLabels).toEqual(["permit_status_escalated"]);

    const evacuate = queue.find((a) => a.id === "tier_critical");
    // tier_critical has no configured dependencies
    expect(evacuate?.dependencyLabels).toEqual([]);
  });

  it("omits a dependency label when the dependency isn't in the current queue", () => {
    const queue = buildActionQueue(
      [{ id: "unauthorized_presence", text: "Verify headcount", severity: "high" }],
      null,
    );
    // depends on permit_status_escalated, but that recommendation isn't active this tick
    expect(queue[0].dependencyLabels).toEqual([]);
  });
});
