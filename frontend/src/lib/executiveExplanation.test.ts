import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../api/types";
import { generateExecutiveExplanation } from "./executiveExplanation";
import type { RiskJustification } from "./justification";
import type { Recommendation } from "./recommendations";

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "z1",
    timestamp: "2026-07-10T09:00:00+00:00",
    compound_risk_score: 50,
    confidence: 0.3,
    tier: "critical",
    justification: {},
    ...overrides,
  };
}

function justification(overrides: Partial<RiskJustification> = {}): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired: [],
    agentContributions: {
      gas_risk: { risk: 90, confidence: 0.3 },
      permit_intelligence: { risk: 65, confidence: 0.3 },
    },
    interactionBonusApplied: 1.0,
    tierBefore: "elevated",
    tierAfter: "critical",
    ...overrides,
  };
}

const recommendation: Recommendation = {
  id: "tier_critical",
  text: "Escalate immediately: evacuate non-essential personnel from this zone.",
  severity: "critical",
};

describe("generateExecutiveExplanation", () => {
  it("names the dominant agent and the runner-up when both are elevated", () => {
    const text = generateExecutiveExplanation(assessment(), justification(), []);
    expect(text).toContain("Gas Risk contributed the highest raw risk this tick (90.0)");
    expect(text).toContain("Permit Intelligence also elevated (65.0)");
  });

  it("omits the runner-up agent when it is below the elevation threshold", () => {
    const text = generateExecutiveExplanation(
      assessment(),
      justification({ agentContributions: { gas_risk: { risk: 90, confidence: 0.3 } } }),
      [],
    );
    expect(text).not.toContain("also elevated");
  });

  it("mentions the interaction bonus only when the rule actually fired", () => {
    const withBonus = generateExecutiveExplanation(
      assessment(),
      justification({ rulesFired: ["interaction_bonus_applied"], interactionBonusApplied: 1.8 }),
      [],
    );
    expect(withBonus).toContain("interaction bonus (×1.80)");

    const withoutBonus = generateExecutiveExplanation(
      assessment(),
      justification({ rulesFired: [], interactionBonusApplied: 1.0 }),
      [],
    );
    expect(withoutBonus).not.toContain("interaction bonus");
  });

  it("describes a tier escalation when tierBefore differs from tierAfter", () => {
    const text = generateExecutiveExplanation(
      assessment(),
      justification({ tierBefore: "elevated", tierAfter: "critical" }),
      [],
    );
    expect(text).toContain("Tier moved from ELEVATED to CRITICAL.");
  });

  it("describes a held tier when tierBefore equals tierAfter", () => {
    const text = generateExecutiveExplanation(
      assessment(),
      justification({ tierBefore: "critical", tierAfter: "critical" }),
      [],
    );
    expect(text).toContain("Tier held at CRITICAL.");
  });

  it("appends the top recommendation's text when recommendations exist", () => {
    const text = generateExecutiveExplanation(assessment(), justification(), [recommendation]);
    expect(text).toContain(`Recommended action: ${recommendation.text}`);
  });

  it("omits a recommendation clause when there are none", () => {
    const text = generateExecutiveExplanation(assessment(), justification(), []);
    expect(text).not.toContain("Recommended action");
  });

  it("falls back to a minimal summary when justification doesn't parse", () => {
    const text = generateExecutiveExplanation(assessment({ tier: "watch", compound_risk_score: 42 }), null, []);
    expect(text).toBe(
      "Assessment recorded at WATCH (42.0); no structured justification is available for this tick.",
    );
  });

  it("is deterministic - identical inputs always produce identical output", () => {
    const a = assessment();
    const j = justification();
    const first = generateExecutiveExplanation(a, j, [recommendation]);
    const second = generateExecutiveExplanation(a, j, [recommendation]);
    expect(first).toBe(second);
  });
});
