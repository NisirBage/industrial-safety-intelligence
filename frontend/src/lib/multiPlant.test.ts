import { describe, expect, it } from "vitest";

import type { ReplayData, RiskAssessment, ScenarioSummary } from "../api/types";
import { buildCorporateOverview, buildPlantSummary } from "./multiPlant";

const SCENARIO: ScenarioSummary = {
  key: "demo",
  title: "Demo Plant Incident",
  description: "A test scenario",
  start_time: "2026-07-01T08:00:00+00:00",
  end_time: "2026-07-01T09:00:00+00:00",
  zone_ids: ["z1", "z2"],
  seed: 1,
};

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "z1",
    timestamp: "2026-07-01T08:05:00+00:00",
    compound_risk_score: 50,
    confidence: 0.9,
    tier: "watch",
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: {},
      interaction_bonus_applied: 1,
      tier_before: "normal",
      tier_after: "watch",
    },
    ...overrides,
  };
}

function replay(assessments: RiskAssessment[]): ReplayData {
  return {
    zone_ids: ["z1", "z2"],
    start_time: "2026-07-01T08:00:00+00:00",
    end_time: "2026-07-01T09:00:00+00:00",
    duration_minutes: 60,
    tick_count: assessments.length,
    zone_timelines: [{ zone_id: "z1", assessments }],
    bookmarks: [],
  };
}

describe("buildPlantSummary", () => {
  it("derives every field from the real replay data, never inventing one", () => {
    const data = replay([
      assessment({
        tier: "watch",
        compound_risk_score: 40,
        justification: {
          schema_version: 1,
          rules_fired: [],
          agent_contributions: {},
          interaction_bonus_applied: 1,
          tier_before: "watch",
          tier_after: "watch",
        },
      }),
      assessment({
        tier: "critical",
        compound_risk_score: 90,
        justification: {
          schema_version: 1,
          rules_fired: [],
          agent_contributions: {},
          interaction_bonus_applied: 1,
          tier_before: "elevated",
          tier_after: "critical",
        },
      }),
    ]);

    const summary = buildPlantSummary(SCENARIO, data);

    expect(summary.scenarioKey).toBe("demo");
    expect(summary.zoneCount).toBe(2);
    expect(summary.worstTier).toBe("critical");
    expect(summary.averageCompoundScore).toBe(65);
    expect(summary.incidentCount).toBe(1);
    expect(summary.readiness).toBe("not_ready");
  });
});

describe("buildCorporateOverview", () => {
  it("aggregates worst-of/sum-of across every plant summary", () => {
    const readyPlant = buildPlantSummary(
      SCENARIO,
      replay([
        assessment({
          tier: "normal",
          justification: {
            schema_version: 1,
            rules_fired: [],
            agent_contributions: {},
            interaction_bonus_applied: 1,
            tier_before: "normal",
            tier_after: "normal",
          },
        }),
      ]),
    );
    const criticalPlant = buildPlantSummary(
      SCENARIO,
      replay([
        assessment({
          tier: "critical",
          compound_risk_score: 95,
          justification: {
            schema_version: 1,
            rules_fired: [],
            agent_contributions: {},
            interaction_bonus_applied: 1,
            tier_before: "elevated",
            tier_after: "critical",
          },
        }),
      ]),
    );

    const overview = buildCorporateOverview([readyPlant, criticalPlant]);

    expect(overview.plantCount).toBe(2);
    expect(overview.totalZones).toBe(4);
    expect(overview.worstTier).toBe("critical");
    expect(overview.readiness).toBe("not_ready");
    expect(overview.totalIncidents).toBe(1);
  });

  it("returns a safe default for zero plants", () => {
    expect(buildCorporateOverview([])).toEqual({
      plantCount: 0,
      totalZones: 0,
      worstTier: null,
      averageCompoundScore: 0,
      totalIncidents: 0,
      readiness: "ready",
    });
  });
});
