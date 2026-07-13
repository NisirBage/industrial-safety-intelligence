import { describe, expect, it } from "vitest";

import type { IncidentMatch, RiskAssessment } from "../api/types";
import { buildActionQueue } from "./actionPlaybook";
import { buildCeoDashboard } from "./ceoDashboard";
import type { RiskJustification } from "./justification";
import type { Recommendation } from "./recommendations";

function assessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "z1",
    timestamp: "2026-07-10T09:00:00+00:00",
    compound_risk_score: 82.5,
    confidence: 0.6,
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
      gas_risk: { risk: 90, confidence: 0.6 },
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

function historicalMatch(overrides: Partial<IncidentMatch> = {}): IncidentMatch {
  return {
    scenario_key: "scenario_critical_gas_leak",
    incident_name: "Critical Gas Leak",
    date: "2026-01-01",
    zone_id: "z1",
    similarity: 0.9,
    outcome_tier: "critical",
    root_cause: "A sudden CO leak.",
    business_impact: "Zone-level critical escalation - the kind of event that would halt operations.",
    operational_impact: "Sustained single-cause gas escalation.",
    safety_impact: "Reached CRITICAL tier.",
    matching_features: [],
    differing_features: [],
    lessons_learned: [],
    evidence_source: "demo-plant-incidents",
    ...overrides,
  };
}

describe("buildCeoDashboard", () => {
  it("derives every field from already-computed values, in plain business language", () => {
    const a = assessment();
    const j = justification();
    const topAction = buildActionQueue([recommendation], j)[0];
    const dashboard = buildCeoDashboard(a, j, [recommendation], topAction, 4, historicalMatch());

    expect(dashboard.currentSituation).toBe("Shutdown recommended.");
    expect(dashboard.businessRisk.level).toBe("Severe");
    expect(dashboard.operationalRiskLabel).toBe("CRITICAL");
    expect(dashboard.operationalRiskScore).toBe(82.5);
    expect(dashboard.estimatedDowntime.sourced).toBe(true);
    expect(dashboard.estimatedDowntime.text).toBe(historicalMatch().business_impact);
    expect(dashboard.workersAffected).toBe(4);
    expect(dashboard.recommendedDecision).toBe(recommendation.text);
    expect(dashboard.confidencePercent).toBe(60);
    expect(dashboard.expectedOutcome).toMatch(/impact on reducing risk/);
  });

  it("shows estimated downtime as honestly unavailable with no historical match", () => {
    const a = assessment({ tier: "normal", compound_risk_score: 5 });
    const dashboard = buildCeoDashboard(a, null, [], undefined, 0, undefined);

    expect(dashboard.estimatedDowntime.sourced).toBe(false);
    expect(dashboard.estimatedDowntime.text).toMatch(/Not available/);
    expect(dashboard.businessRisk.level).toBe("Low");
    expect(dashboard.recommendedDecision).toMatch(/No action required/);
    expect(dashboard.expectedOutcome).toMatch(/No open recommendation/);
  });
});
