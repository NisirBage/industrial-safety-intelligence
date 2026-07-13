import { describe, expect, it } from "vitest";

import type { ForesightResult, IncidentMatch, RiskAssessment } from "../api/types";
import { buildConfidenceBreakdown } from "./confidenceBreakdown";
import type { RiskJustification } from "./justification";

const ASSESSMENT: RiskAssessment = {
  assessment_id: "a1",
  zone_id: "z1",
  timestamp: "2026-07-01T08:05:00+00:00",
  compound_risk_score: 72,
  confidence: 0.91,
  tier: "elevated",
  justification: {},
};

function justification(overrides: Partial<RiskJustification> = {}): RiskJustification {
  return {
    schemaVersion: 1,
    rulesFired: [],
    agentContributions: { gas_risk: { risk: 60, confidence: 0.96 } },
    interactionBonusApplied: 1,
    tierBefore: "watch",
    tierAfter: "elevated",
    ...overrides,
  };
}

const HISTORICAL_MATCH: IncidentMatch = {
  scenario_key: "demo",
  incident_name: "Tank Farm Overpressure",
  date: "2024-01-01",
  zone_id: "z1",
  similarity: 0.94,
  outcome_tier: "critical",
  root_cause: "",
  business_impact: "",
  operational_impact: "",
  safety_impact: "",
  matching_features: [],
  differing_features: [],
  lessons_learned: [],
  evidence_source: "",
};

const STAGE = { label: "Stable", tier: "elevated" as const, supporting_matches: 1, total_matches: 1, evidence: "" };

function foresight(): ForesightResult {
  return {
    zone_id: "z1",
    timestamp: "2026-07-01T08:05:00+00:00",
    current_risk_score: 72,
    current_tier: "elevated",
    window_size: 5,
    current_window_length: 5,
    matches: [],
    forecast: [],
    confidence: {
      historical_agreement: 0.94,
      data_completeness: 0.91,
      trajectory_similarity: 0.88,
      replay_coverage: 0.97,
      overall: 0.88,
    },
    progression: {
      current_stage: STAGE,
      likely_next_stage: STAGE,
      likely_following_stage: STAGE,
      expected_resolution: STAGE,
    },
    early_warning: {
      category: "Potential Escalation",
      why: "1 of 1 matched incident(s) show tier rising.",
      supporting_matches: 1,
      total_matches: 1,
    },
    deck_contributions: [],
  };
}

describe("buildConfidenceBreakdown", () => {
  it("always includes Overall from RiskAssessment.confidence", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, null, undefined, undefined);
    const overall = factors.find((f) => f.label === "Overall");
    expect(overall).toEqual({
      label: "Overall",
      kind: "percentage",
      value: 0.91,
      source: "RiskAssessment.confidence - Fusion's minimum-across-agents aggregation.",
    });
  });

  it("uses the real historical match similarity when no forecast exists", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, justification(), HISTORICAL_MATCH, undefined);
    const historical = factors.find((f) => f.label === "Historical Agreement");
    expect(historical).toMatchObject({ kind: "percentage", value: 0.94 });
  });

  it("prefers Foresight's own confidence fields when a forecast exists", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, justification(), HISTORICAL_MATCH, foresight());
    const historical = factors.find((f) => f.label === "Historical Agreement");
    const forecastAgreement = factors.find((f) => f.label === "Forecast Agreement");
    const completeness = factors.find((f) => f.label === "Data Completeness");
    expect(historical).toMatchObject({ kind: "percentage", value: 0.94 });
    expect(forecastAgreement).toMatchObject({ kind: "percentage", value: 0.88 });
    expect(completeness).toMatchObject({ kind: "percentage", value: 0.91 });
  });

  it("shows Operational Stability as a real category, never a fabricated percentage", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, justification(), undefined, foresight());
    const stability = factors.find((f) => f.label === "Operational Stability");
    expect(stability).toEqual({
      label: "Operational Stability",
      kind: "categorical",
      categoryLabel: "Potential Escalation",
      source: "Operational Foresight's early-warning signal (categorical, not a percentage).",
    });
  });

  it("marks factors unavailable rather than inventing a value when nothing grounds them", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, null, undefined, undefined);
    const historical = factors.find((f) => f.label === "Historical Agreement");
    const sensor = factors.find((f) => f.label === "Sensor Quality");
    const forecastAgreement = factors.find((f) => f.label === "Forecast Agreement");
    const stability = factors.find((f) => f.label === "Operational Stability");
    expect(historical?.kind).toBe("unavailable");
    expect(sensor?.kind).toBe("unavailable");
    expect(forecastAgreement?.kind).toBe("unavailable");
    expect(stability?.kind).toBe("unavailable");
  });

  it("derives Data Completeness from Gas Risk's own confidence when a fail-safe rule fired and no forecast exists", () => {
    const factors = buildConfidenceBreakdown(
      ASSESSMENT,
      justification({ rulesFired: ["missing_data_fail_safe"] }),
      undefined,
      undefined,
    );
    const completeness = factors.find((f) => f.label === "Data Completeness");
    expect(completeness).toMatchObject({ kind: "percentage", value: 0.96 });
  });

  it("treats Data Completeness as fully available (1.0) when no fail-safe rule fired and no forecast exists", () => {
    const factors = buildConfidenceBreakdown(ASSESSMENT, justification(), undefined, undefined);
    const completeness = factors.find((f) => f.label === "Data Completeness");
    expect(completeness).toMatchObject({ kind: "percentage", value: 1 });
  });
});
