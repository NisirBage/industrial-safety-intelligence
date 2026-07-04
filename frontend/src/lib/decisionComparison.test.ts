import { describe, expect, it } from "vitest";

import type { CounterfactualVerdict } from "../api/types";
import { explainComparison, pickComparisonMoment, type ComparisonMoment } from "./decisionComparison";
import type { RiskJustification } from "./justification";

function counterfactual(overrides: Partial<CounterfactualVerdict> = {}): CounterfactualVerdict {
  return { alert: false, triggered_sensors: [], highest_ratio: 0.5, ...overrides };
}

function justification(overrides: Partial<RiskJustification> = {}): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired: [],
    agentContributions: {},
    interactionBonusApplied: 0,
    tierBefore: "normal",
    tierAfter: "normal",
    ...overrides,
  };
}

describe("pickComparisonMoment", () => {
  it("prefers a genuine miss over a moment where both systems agree", () => {
    const moments: ComparisonMoment[] = [
      {
        zoneId: "z1",
        timestamp: "t1",
        compound: { compound_risk_score: 60, confidence: 1, tier: "elevated" },
        counterfactual: counterfactual({ alert: true }),
      },
      {
        zoneId: "z1",
        timestamp: "t2",
        compound: { compound_risk_score: 40, confidence: 1, tier: "watch" },
        counterfactual: counterfactual({ alert: false }),
      },
    ];
    expect(pickComparisonMoment(moments)?.timestamp).toBe("t2");
  });

  it("picks the highest-scoring miss when several exist", () => {
    const moments: ComparisonMoment[] = [
      {
        zoneId: "z1",
        timestamp: "t1",
        compound: { compound_risk_score: 70, confidence: 1, tier: "critical" },
        counterfactual: counterfactual({ alert: false }),
      },
      {
        zoneId: "z1",
        timestamp: "t2",
        compound: { compound_risk_score: 99, confidence: 1, tier: "critical" },
        counterfactual: counterfactual({ alert: false }),
      },
    ];
    expect(pickComparisonMoment(moments)?.timestamp).toBe("t2");
  });

  it("falls back to the highest-scoring moment when there is no divergence", () => {
    const moments: ComparisonMoment[] = [
      {
        zoneId: "z1",
        timestamp: "t1",
        compound: { compound_risk_score: 20, confidence: 1, tier: "normal" },
        counterfactual: counterfactual({ alert: false }),
      },
      {
        zoneId: "z1",
        timestamp: "t2",
        compound: { compound_risk_score: 80, confidence: 1, tier: "critical" },
        counterfactual: counterfactual({ alert: true }),
      },
    ];
    expect(pickComparisonMoment(moments)?.timestamp).toBe("t2");
  });

  it("returns null when nothing has a persisted compound verdict", () => {
    const moments: ComparisonMoment[] = [
      { zoneId: "z1", timestamp: "t1", compound: null, counterfactual: counterfactual() },
    ];
    expect(pickComparisonMoment(moments)).toBeNull();
  });
});

describe("explainComparison", () => {
  it("explains a miss caused by an interaction bonus", () => {
    // Fusion only appends "interaction_bonus_applied" to rules_fired
    // when its own multiplier > 1.0 (risk_formula.py's `fuse`) - that
    // rule identifier, not a raw multiplier > 0 check, is what this
    // function keys off, matching the frozen engine's own condition.
    const text = explainComparison(
      { compound_risk_score: 95, confidence: 1, tier: "critical" },
      counterfactual({ alert: false }),
      justification({ interactionBonusApplied: 1.8, rulesFired: ["interaction_bonus_applied"] }),
    );
    expect(text).toContain("1.80x");
  });

  it("explains a miss with no interaction bonus via the naive ratio", () => {
    const text = explainComparison(
      { compound_risk_score: 90, confidence: 1, tier: "critical" },
      counterfactual({ alert: false, highest_ratio: 0.72 }),
      justification({ interactionBonusApplied: 1.0, rulesFired: ["weighted_sum_fusion"] }),
    );
    expect(text).toContain("72%");
  });

  it("says both systems agree when there is no miss", () => {
    const text = explainComparison(
      { compound_risk_score: 90, confidence: 1, tier: "critical" },
      counterfactual({ alert: true }),
      justification(),
    );
    expect(text).toMatch(/agree/i);
  });

  it("handles a missing compound verdict", () => {
    expect(explainComparison(null, counterfactual(), null)).toMatch(/no persisted/i);
  });
});
