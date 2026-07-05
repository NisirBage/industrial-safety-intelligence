import { describe, expect, it } from "vitest";

import type { RiskAssessment, ScenarioSummary } from "../api/types";
import {
  computeRelativeShares,
  elapsedBeforeScene,
  findFirstEscalationIndex,
  findPeakIndex,
  PLATFORM_CAPABILITIES,
  PLATFORM_STATS,
  PRESENTATION_SCENES,
  remainingAfterScene,
  selectPresentationScenario,
  TOTAL_PRESENTATION_DURATION_MS,
} from "./presentationScript";

function scenario(overrides: Partial<ScenarioSummary>): ScenarioSummary {
  return {
    key: "demo",
    title: "Demo",
    description: "",
    start_time: "2026-01-01T00:00:00Z",
    end_time: "2026-01-01T01:00:00Z",
    zone_ids: [],
    seed: 1,
    ...overrides,
  };
}

function assessment(overrides: Partial<RiskAssessment>): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "zone-a",
    timestamp: "2026-01-01T00:00:00Z",
    compound_risk_score: 10,
    confidence: 1,
    tier: "normal",
    justification: {},
    ...overrides,
  };
}

describe("PRESENTATION_SCENES", () => {
  it("has exactly 10 scenes, index 0-9 in order", () => {
    expect(PRESENTATION_SCENES).toHaveLength(10);
    expect(PRESENTATION_SCENES.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("fixes Scene 1 (title) at exactly 3 seconds", () => {
    expect(PRESENTATION_SCENES[0].durationMs).toBe(3000);
  });
});

describe("elapsedBeforeScene / remainingAfterScene", () => {
  it("elapsed before the first scene is zero", () => {
    expect(elapsedBeforeScene(0)).toBe(0);
  });

  it("elapsed before scene 1 equals scene 0's duration", () => {
    expect(elapsedBeforeScene(1)).toBe(PRESENTATION_SCENES[0].durationMs);
  });

  it("remaining after the last scene is zero", () => {
    expect(remainingAfterScene(PRESENTATION_SCENES.length - 1)).toBe(0);
  });

  it("elapsed + remaining + current scene duration always equals the total", () => {
    for (const scene of PRESENTATION_SCENES) {
      const sum = elapsedBeforeScene(scene.index) + scene.durationMs + remainingAfterScene(scene.index);
      expect(sum).toBe(TOTAL_PRESENTATION_DURATION_MS);
    }
  });
});

describe("selectPresentationScenario", () => {
  it("prefers a scenario whose key or title mentions SIMOPS or critical", () => {
    const scenarios = [
      scenario({ key: "demo_vizag_clairton", title: "Demo" }),
      scenario({ key: "scenario_simops_conflict", title: "Tank Farm SIMOPS Conflict" }),
    ];
    expect(selectPresentationScenario(scenarios)?.key).toBe("scenario_simops_conflict");
  });

  it("falls back to the first cataloged scenario when nothing dramatic matches", () => {
    const scenarios = [scenario({ key: "a" }), scenario({ key: "b" })];
    expect(selectPresentationScenario(scenarios)?.key).toBe("a");
  });

  it("returns null for an empty catalog", () => {
    expect(selectPresentationScenario([])).toBeNull();
  });
});

describe("findFirstEscalationIndex", () => {
  it("finds the first tick whose tier isn't normal", () => {
    const assessments = [
      assessment({ tier: "normal" }),
      assessment({ tier: "normal" }),
      assessment({ tier: "watch" }),
      assessment({ tier: "critical" }),
    ];
    expect(findFirstEscalationIndex(assessments)).toBe(2);
  });

  it("returns 0 when the scenario never leaves normal", () => {
    expect(findFirstEscalationIndex([assessment({ tier: "normal" })])).toBe(0);
  });
});

describe("findPeakIndex", () => {
  it("finds the index of the single highest compound_risk_score", () => {
    const assessments = [
      assessment({ compound_risk_score: 10 }),
      assessment({ compound_risk_score: 90 }),
      assessment({ compound_risk_score: 50 }),
    ];
    expect(findPeakIndex(assessments)).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(findPeakIndex([])).toBe(0);
  });
});

describe("computeRelativeShares", () => {
  it("computes each agent's raw risk as a share of the total, summing to ~100%", () => {
    const shares = computeRelativeShares({
      schemaVersion: 1,
      rulesFired: [],
      agentContributions: {
        gas_risk: { risk: 60, confidence: 0.5 },
        equipment_status: { risk: 40, confidence: 1 },
      },
      interactionBonusApplied: 1,
      tierBefore: "watch",
      tierAfter: "watch",
    });
    expect(shares[0]).toMatchObject({ agentName: "gas_risk", sharePercent: 60 });
    expect(shares[1]).toMatchObject({ agentName: "equipment_status", sharePercent: 40 });
  });

  it("returns 0% shares rather than dividing by zero when every agent is at 0 risk", () => {
    const shares = computeRelativeShares({
      schemaVersion: 1,
      rulesFired: [],
      agentContributions: { gas_risk: { risk: 0, confidence: 1 } },
      interactionBonusApplied: 1,
      tierBefore: "normal",
      tierAfter: "normal",
    });
    expect(shares[0].sharePercent).toBe(0);
  });

  it("returns an empty array when justification is null", () => {
    expect(computeRelativeShares(null)).toEqual([]);
  });
});

describe("PLATFORM_STATS / PLATFORM_CAPABILITIES", () => {
  it("every stat has a non-empty label and a non-negative value", () => {
    for (const stat of PLATFORM_STATS) {
      expect(stat.label.length).toBeGreaterThan(0);
      expect(stat.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("lists at least the five documented production-readiness capabilities", () => {
    expect(PLATFORM_CAPABILITIES.length).toBeGreaterThanOrEqual(5);
  });
});
