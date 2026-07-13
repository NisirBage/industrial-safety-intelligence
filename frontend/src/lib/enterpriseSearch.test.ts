import { describe, expect, it } from "vitest";

import type {
  CrossScenarioAnalytics,
  GraphEntity,
  Permit,
  Zone,
} from "../api/types";
import {
  graphEntityToSearchResult,
  searchAnalyticsLessonsAndHazards,
  searchBusinessImpacts,
  searchCounterfactuals,
  searchEvents,
  searchForecasts,
  searchPermits,
  searchRecommendationTemplates,
  searchStandards,
  type ScenarioMoment,
} from "./enterpriseSearch";

const ZONE: Zone = {
  zone_id: "z1",
  name: "Tank Farm",
  plant_section: "Storage",
  oisd_area_classification: "Non-hazardous",
};

describe("graphEntityToSearchResult", () => {
  it("deep-links a zone to its own dedicated page", () => {
    const entity: GraphEntity = { kind: "zone", id: "z1", label: "Tank Farm", attributes: {} };
    expect(graphEntityToSearchResult(entity)).toEqual({
      category: "Zone",
      id: "zone:z1",
      label: "Tank Farm",
      detail: "Zone",
      deepLink: "/zones/z1",
    });
  });

  it("deep-links every other kind into the Knowledge Graph, focused on that node", () => {
    const entity: GraphEntity = { kind: "sensor", id: "s1", label: "CO sensor", attributes: {} };
    const result = graphEntityToSearchResult(entity);
    expect(result?.deepLink).toBe("/knowledge-graph?focus=sensor%3As1");
    expect(result?.category).toBe("Sensor");
  });

  it("returns null for kinds this search doesn't cover (per-tick entities)", () => {
    const entity: GraphEntity = { kind: "risk_assessment", id: "a1", label: "a1", attributes: {} };
    expect(graphEntityToSearchResult(entity)).toBeNull();
  });
});

describe("searchPermits", () => {
  const permits: Permit[] = [
    {
      permit_id: "p1",
      permit_type: "Hot Work",
      zone_id: "z1",
      issued_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-02T00:00:00Z",
      authorizing_officer_id: "w1",
      status: "active",
      baseline_snapshot: {},
    },
  ];

  it("matches on permit type", () => {
    expect(searchPermits(permits, [ZONE], "hot")).toHaveLength(1);
  });

  it("matches on zone label", () => {
    expect(searchPermits(permits, [ZONE], "tank")).toHaveLength(1);
  });

  it("returns nothing for an empty query", () => {
    expect(searchPermits(permits, [ZONE], "")).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchPermits(permits, [ZONE], "confined space")).toEqual([]);
  });
});

describe("searchRecommendationTemplates", () => {
  it("finds a known recommendation by substring", () => {
    const results = searchRecommendationTemplates("evacuate");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe("Recommendation");
    expect(results[0].detail).toContain("not a specific tick");
  });

  it("returns nothing for an empty query", () => {
    expect(searchRecommendationTemplates("")).toEqual([]);
  });
});

describe("searchStandards", () => {
  it("finds a known standard by summary text", () => {
    const results = searchStandards("recognized hazards");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe("Standard");
    expect(results[0].label).toContain("OSHA General Duty Clause");
  });

  it("deduplicates the same standard reused across recommendation ids", () => {
    const results = searchStandards("OSHA General Duty Clause");
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(results.length);
  });

  it("returns nothing for an empty query", () => {
    expect(searchStandards("")).toEqual([]);
  });
});

describe("searchAnalyticsLessonsAndHazards", () => {
  const analytics: CrossScenarioAnalytics = {
    total_incidents: 3,
    total_indexed_ticks: 42,
    most_common_causes: [
      { rule: "tier_escalated", lesson: "Escalations that hold past dwell time are real.", incident_count: 2 },
    ],
    most_common_equipment_issues: [],
    most_common_permit_conflicts: [],
    most_common_worker_hazards: [
      { rule: "worker_exposure_elevated", lesson: "Unprotected exposure near active leaks.", incident_count: 1 },
    ],
    average_resolution_minutes: 18.5,
    most_effective_interventions: { reason: "n/a" },
    industry_comparisons: { reason: "n/a" },
  };

  it("surfaces cause/equipment/permit rules as Lesson results", () => {
    const results = searchAnalyticsLessonsAndHazards(analytics, "dwell time");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Lesson");
  });

  it("surfaces worker-hazard rules as Hazard results", () => {
    const results = searchAnalyticsLessonsAndHazards(analytics, "unprotected exposure");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Hazard");
  });

  it("returns nothing when analytics hasn't loaded yet", () => {
    expect(searchAnalyticsLessonsAndHazards(undefined, "dwell time")).toEqual([]);
  });
});

describe("ScenarioMoment-based search (Events, Counterfactuals, Forecasts, Business Impacts)", () => {
  const ZONE: Zone = {
    zone_id: "z1",
    name: "Tank Farm",
    plant_section: "Storage",
    oisd_area_classification: "Non-hazardous",
  };

  const moment: ScenarioMoment = {
    scenarioKey: "demo_vizag_clairton",
    scenarioTitle: "Vizag-Clairton Demo Incident",
    zoneId: "z1",
    timestamp: "2026-07-01T08:05:00+00:00",
    assessmentId: "a1",
    events: [
      { timestamp: "2026-07-01T08:05:00+00:00", zone_id: "z1", kind: "tier_change", label: "Escalated to Elevated", assessment_id: "a1" },
    ],
    counterfactual: {
      zone_id: "z1",
      timestamp: "2026-07-01T08:05:00+00:00",
      counterfactual: { alert: false, triggered_sensors: [], highest_ratio: 0.6 },
      compound: { compound_risk_score: 72.5, confidence: 0.8, tier: "elevated" },
    },
    foresight: {
      zone_id: "z1",
      timestamp: "2026-07-01T08:05:00+00:00",
      current_risk_score: 60.0,
      current_tier: "watch",
      window_size: 5,
      current_window_length: 3,
      matches: [],
      forecast: [],
      confidence: {
        historical_agreement: 0.8,
        data_completeness: 0.9,
        trajectory_similarity: 0.7,
        replay_coverage: 0.33,
        overall: 0.7,
      },
      progression: {
        current_stage: { label: "Escalating", tier: "watch", supporting_matches: 2, total_matches: 3, evidence: "n/a" },
        likely_next_stage: { label: "Elevated", tier: "elevated", supporting_matches: 2, total_matches: 3, evidence: "n/a" },
        likely_following_stage: { label: "Critical", tier: "critical", supporting_matches: 1, total_matches: 3, evidence: "n/a" },
        expected_resolution: { label: "Resolved", tier: "normal", supporting_matches: 1, total_matches: 3, evidence: "n/a" },
      },
      early_warning: { category: "Potential Escalation", why: "Gas concentration rising sharply.", supporting_matches: 2, total_matches: 3 },
      deck_contributions: [],
    },
    bestMatch: {
      scenario_key: "demo_vizag_clairton",
      incident_name: "Reference Incident",
      date: "2026-07-01",
      zone_id: "z1",
      similarity: 0.9,
      outcome_tier: "elevated",
      root_cause: "Hot work permit issued while gas rose.",
      business_impact: "Estimated four hours of unplanned downtime.",
      operational_impact: "n/a",
      safety_impact: "n/a",
      matching_features: [],
      differing_features: [],
      lessons_learned: [],
      evidence_source: "n/a",
    },
  };

  it("searchEvents finds a bookmark by label", () => {
    const results = searchEvents([moment], [ZONE], "escalated");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Event");
  });

  it("searchCounterfactuals finds a moment's counterfactual by scenario title", () => {
    const results = searchCounterfactuals([moment], [ZONE], "vizag");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Counterfactual");
    expect(results[0].label).toContain("stayed silent");
  });

  it("searchForecasts finds a moment's early warning by reason text", () => {
    const results = searchForecasts([moment], [ZONE], "gas concentration");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Forecast");
    expect(results[0].deepLink).toBe("/decision-workspace/a1?stage=forecast");
  });

  it("searchBusinessImpacts finds a moment's business impact text", () => {
    const results = searchBusinessImpacts([moment], [ZONE], "unplanned downtime");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Business Impact");
    expect(results[0].deepLink).toBe("/decision-workspace/a1?stage=business_impact");
  });

  it("returns nothing for an empty query across all four", () => {
    expect(searchEvents([moment], [ZONE], "")).toEqual([]);
    expect(searchCounterfactuals([moment], [ZONE], "")).toEqual([]);
    expect(searchForecasts([moment], [ZONE], "")).toEqual([]);
    expect(searchBusinessImpacts([moment], [ZONE], "")).toEqual([]);
  });
});
