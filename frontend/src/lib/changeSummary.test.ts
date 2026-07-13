import { describe, expect, it } from "vitest";

import type { ForesightResult, IncidentMatch, RiskAssessment } from "../api/types";
import { buildChangeSummary } from "./changeSummary";

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "z1",
    timestamp: "2026-07-01T08:00:00+00:00",
    compound_risk_score: 50,
    confidence: 0.8,
    tier: "watch",
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: {},
      interaction_bonus_applied: 1,
      tier_before: "watch",
      tier_after: "watch",
    },
    ...overrides,
  };
}

function historicalMatch(overrides: Partial<IncidentMatch> = {}): IncidentMatch {
  return {
    scenario_key: "scenario_critical_gas_leak",
    incident_name: "Critical Gas Leak",
    date: "2026-01-01",
    zone_id: "z1",
    similarity: 0.5,
    outcome_tier: "critical",
    root_cause: "test",
    business_impact: "test",
    operational_impact: "test",
    safety_impact: "test",
    matching_features: [],
    differing_features: [],
    lessons_learned: [],
    evidence_source: "demo-plant-incidents",
    ...overrides,
  };
}

function foresight(category: string): ForesightResult {
  const stage = { stage: "watch", entered_at: "2026-07-01T08:00:00+00:00" };
  return {
    zone_id: "z1",
    timestamp: "2026-07-01T08:00:00+00:00",
    forecast: [],
    confidence: {
      overall: 0.8,
      historical_agreement: 0.8,
      data_completeness: 1,
      trajectory_similarity: 0.8,
    },
    progression: {
      current_stage: stage,
      likely_next_stage: stage,
      likely_following_stage: stage,
      expected_resolution: "unknown",
    },
    early_warning: { category, why: "test" },
    deck_contributions: [],
  } as unknown as ForesightResult;
}

describe("buildChangeSummary", () => {
  it("returns nothing on the first tick (no previous assessment)", () => {
    expect(buildChangeSummary({ previousAssessment: null, currentAssessment: assessment() })).toEqual([]);
  });

  it("reports a risk delta when the tier changes", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment({ tier: "watch", compound_risk_score: 40 }),
      currentAssessment: assessment({ tier: "critical", compound_risk_score: 90 }),
    });

    const risk = entries.find((e) => e.label === "Risk");
    expect(risk).toBeDefined();
    expect(risk?.before).toBe("WATCH (40.0)");
    expect(risk?.after).toBe("CRITICAL (90.0)");
  });

  it("omits the risk delta for a sub-threshold score wobble at the same tier", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment({ tier: "watch", compound_risk_score: 40 }),
      currentAssessment: assessment({ tier: "watch", compound_risk_score: 41 }),
    });

    expect(entries.find((e) => e.label === "Risk")).toBeUndefined();
  });

  it("reports a recommendation delta when the top recommendation changes", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment({ tier: "watch" }),
      currentAssessment: assessment({ tier: "critical" }),
    });

    expect(entries.find((e) => e.label === "Recommendation")).toBeDefined();
  });

  it("reports a permit delta when the escalation rule appears", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment(),
      currentAssessment: assessment({
        justification: {
          schema_version: 1,
          rules_fired: ["permit_status_escalated"],
          agent_contributions: {},
          interaction_bonus_applied: 1,
          tier_before: "watch",
          tier_after: "watch",
        },
      }),
    });

    const permit = entries.find((e) => e.label === "Permit");
    expect(permit).toEqual({ label: "Permit", before: "No escalation", after: "Escalation flagged" });
  });

  it("reports a historical delta when the best match changes", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment(),
      currentAssessment: assessment(),
      previousBestMatch: historicalMatch({ incident_name: "Incident A", similarity: 0.5 }),
      currentBestMatch: historicalMatch({ incident_name: "Incident B", similarity: 0.9 }),
    });

    const historical = entries.find((e) => e.label === "Historical");
    expect(historical?.before).toMatch(/Incident A/);
    expect(historical?.after).toMatch(/Incident B/);
  });

  it("reports a forecast delta when the early warning category changes", () => {
    const entries = buildChangeSummary({
      previousAssessment: assessment(),
      currentAssessment: assessment(),
      previousForesight: foresight("stable"),
      currentForesight: foresight("escalating"),
    });

    expect(entries.find((e) => e.label === "Forecast")).toEqual({
      label: "Forecast",
      before: "stable",
      after: "escalating",
    });
  });

  it("returns an empty summary when nothing meaningful changed", () => {
    const a = assessment();
    expect(buildChangeSummary({ previousAssessment: a, currentAssessment: a })).toEqual([]);
  });
});
