import { http, HttpResponse } from "msw";

import type {
  AuditLogEntry,
  CounterfactualComparison,
  CrossScenarioAnalytics,
  ForesightResult,
  GraphEntity,
  GraphNeighbors,
  GraphPath,
  GraphSearchResult,
  GraphSubgraph,
  HistoricalDeck,
  IncidentMatchesResult,
  Permit,
  RiskAssessment,
  ScenarioSummary,
  Zone,
} from "../../api/types";

/**
 * Canned responses matching the backend's real shapes exactly
 * (src/api/schemas/*.py) - used only in tests, never shipped. Real
 * data comes exclusively from the live REST API; this is what lets
 * component tests exercise "populated" states without a live
 * database, which this project's own backend test suite has never
 * had access to either (see docs/architecture/integration_readiness.md).
 */

const ZONE_A = "11111111-1111-1111-1111-111111111111";
const ZONE_B = "22222222-2222-2222-2222-222222222222";

export const mockCurrentRisk: RiskAssessment[] = [
  {
    assessment_id: "a1",
    zone_id: ZONE_A,
    timestamp: "2026-07-01T08:05:00+00:00",
    compound_risk_score: 72.5,
    confidence: 0.8,
    tier: "elevated",
    justification: {
      schema_version: 1,
      rules_fired: ["gas_risk_elevated", "permit_intelligence_flagged", "tier_escalated"],
      agent_contributions: {
        gas_risk: { risk: 82.5, confidence: 0.9 },
        permit_intelligence: { risk: 55.0, confidence: 0.85 },
        worker_exposure: { risk: 30.0, confidence: 1.0 },
        equipment_status: { risk: 10.0, confidence: 1.0 },
      },
      interaction_bonus_applied: 12.5,
      tier_before: "watch",
      tier_after: "elevated",
    },
  },
  {
    assessment_id: "a2",
    zone_id: ZONE_B,
    timestamp: "2026-07-01T08:00:00+00:00",
    compound_risk_score: 12.0,
    confidence: 1.0,
    tier: "normal",
    justification: { schema_version: 1 },
  },
];

export const mockRiskHistory: RiskAssessment[] = [
  { ...mockCurrentRisk[0], timestamp: "2026-07-01T08:05:00+00:00", compound_risk_score: 72.5 },
  { ...mockCurrentRisk[0], timestamp: "2026-07-01T08:00:00+00:00", compound_risk_score: 40.0 },
];

export const mockPermits: Permit[] = [
  {
    permit_id: "p1",
    permit_type: "hot_work",
    zone_id: ZONE_A,
    issued_at: "2026-07-01T06:00:00+00:00",
    expires_at: "2026-07-01T14:00:00+00:00",
    authorizing_officer_id: "worker-1",
    status: "active",
    baseline_snapshot: { gas_risk_at_issuance: 20.0 },
  },
];

export const mockAuditLog: AuditLogEntry[] = [];

export const mockZones: Zone[] = [
  { zone_id: ZONE_A, name: "Tank Farm", plant_section: "Storage", oisd_area_classification: "zone_0" },
  {
    zone_id: ZONE_B,
    name: "Compressor House",
    plant_section: "Utilities",
    oisd_area_classification: "zone_1",
  },
];

export const mockScenarios: ScenarioSummary[] = [
  {
    key: "demo_vizag_clairton",
    title: "Vizag-Clairton Demo Incident",
    description: "Hot work permit issued while CO and CH4 rise.",
    start_time: "2026-07-01T08:00:00+00:00",
    end_time: "2026-07-01T08:30:00+00:00",
    zone_ids: [ZONE_A, ZONE_B],
    seed: 42,
  },
];

export const mockCounterfactual: CounterfactualComparison = {
  zone_id: ZONE_A,
  timestamp: "2026-07-01T08:05:00+00:00",
  counterfactual: { alert: false, triggered_sensors: [], highest_ratio: 0.6 },
  compound: { compound_risk_score: 72.5, confidence: 0.8, tier: "elevated" },
};

export const mockHistoricalDecks: HistoricalDeck[] = [
  {
    key: "demo-plant-incidents",
    name: "Demo Plant Incidents",
    description: "Every scenario this platform has actually simulated and replayed.",
    incidents: [
      {
        scenario_key: "demo_vizag_clairton",
        root_cause: "A hot work permit was issued while CO pressure began rising.",
        business_impact: "Reference scenario - the platform's own golden-path regression test.",
        operational_impact: "Concurrent permit activity and gas escalation across two zones.",
        safety_impact: "Demonstrates the full pipeline from sensor rise through tier escalation.",
      },
    ],
  },
];

export const mockHistoricalMatches: IncidentMatchesResult = {
  zone_id: ZONE_A,
  timestamp: "2026-07-01T08:05:00+00:00",
  matches: [
    {
      scenario_key: "demo_vizag_clairton",
      incident_name: "demo_vizag_clairton",
      date: "2026-07-01T08:05:00+00:00",
      zone_id: ZONE_A,
      similarity: 0.87,
      outcome_tier: "elevated",
      root_cause: "A hot work permit was issued while CO pressure began rising.",
      business_impact: "Reference scenario - the platform's own golden-path regression test.",
      operational_impact: "Concurrent permit activity and gas escalation across two zones.",
      safety_impact: "Demonstrates the full pipeline from sensor rise through tier escalation.",
      matching_features: ["gas_risk", "tier_ordinal"],
      differing_features: ["permit_risk"],
      lessons_learned: [
        { rule: "tier_escalated", lesson: "Escalations that hold past dwell time are real." },
      ],
      evidence_source: "demo_vizag_clairton @ 2026-07-01T08:05:00+00:00 (assessment a1)",
    },
  ],
};

export const mockHistoricalAnalytics: CrossScenarioAnalytics = {
  total_incidents: 3,
  total_indexed_ticks: 42,
  most_common_causes: [
    { rule: "tier_escalated", lesson: "Escalations that hold past dwell time are real.", incident_count: 2 },
  ],
  most_common_equipment_issues: [],
  most_common_permit_conflicts: [],
  most_common_worker_hazards: [],
  average_resolution_minutes: 18.5,
  most_effective_interventions: { reason: "No intervention mechanic exists in this platform yet." },
  industry_comparisons: { reason: "Only one real deck exists - nothing to compare across industries." },
};

export const mockForesightResult: ForesightResult = {
  zone_id: ZONE_A,
  timestamp: "2026-07-01T08:05:00+00:00",
  current_risk_score: 60.0,
  current_tier: "watch",
  window_size: 5,
  current_window_length: 3,
  matches: [
    {
      scenario_key: "demo_vizag_clairton",
      incident_name: "Vizag-Clairton Demo Incident",
      zone_id: ZONE_A,
      anchor_timestamp: "2026-07-01T08:00:00+00:00",
      similarity: 0.82,
      window_length: 3,
    },
  ],
  forecast: [
    {
      horizon_minutes: 15,
      projected_risk: 74.0,
      projected_tier: "elevated",
      evidence: [
        {
          scenario_key: "demo_vizag_clairton",
          zone_id: ZONE_A,
          similarity: 0.82,
          observed_risk: 74.0,
          observed_tier: "elevated",
          observed_timestamp: "2026-07-01T08:15:00+00:00",
          minutes_after_anchor: 15,
        },
      ],
      unavailable_reason: null,
    },
    {
      horizon_minutes: 30,
      projected_risk: null,
      projected_tier: null,
      evidence: [],
      unavailable_reason: "No matched historical incident has persisted data reaching 30 minutes past the matched point.",
    },
    {
      horizon_minutes: 60,
      projected_risk: null,
      projected_tier: null,
      evidence: [],
      unavailable_reason: "No matched historical incident has persisted data reaching 60 minutes past the matched point.",
    },
  ],
  confidence: {
    historical_agreement: 0.0,
    data_completeness: 0.6,
    trajectory_similarity: 0.82,
    replay_coverage: 0.33,
    overall: 0.0,
  },
  progression: {
    current_stage: {
      label: "WATCH",
      tier: "watch",
      supporting_matches: 1,
      total_matches: 1,
      evidence: "Current persisted tier for this zone - not a projection.",
    },
    likely_next_stage: {
      label: "ELEVATED",
      tier: "elevated",
      supporting_matches: 1,
      total_matches: 1,
      evidence: "1 of 1 matched incident(s) support ELEVATED within 15 minutes.",
    },
    likely_following_stage: {
      label: "Unavailable",
      tier: null,
      supporting_matches: 0,
      total_matches: 1,
      evidence: "No matched historical incident has data at this horizon.",
    },
    expected_resolution: {
      label: "Unavailable",
      tier: null,
      supporting_matches: 0,
      total_matches: 1,
      evidence: "No matched incident returned to NORMAL within its own persisted replay window.",
    },
  },
  early_warning: {
    category: "Potential Escalation",
    why: "1 of 1 matched incident(s) show tier rising to ELEVATED within 15 minutes.",
    supporting_matches: 1,
    total_matches: 1,
  },
  deck_contributions: [
    { deck_key: "demo-plant-incidents", deck_name: "Demo Plant Incidents", matched_incident_count: 1 },
  ],
};

function mockGraphZoneEntity(id: string): GraphEntity {
  return {
    kind: "zone",
    id,
    label: "Tank Farm",
    attributes: { zone_id: id, name: "Tank Farm", plant_section: "Storage" },
  };
}

const mockGraphSensorEntity: GraphEntity = {
  kind: "sensor",
  id: "sensor-1",
  label: "CO sensor",
  attributes: { sensor_id: "sensor-1", zone_id: ZONE_A, gas_type: "CO" },
};

function mockGraphNeighbors(id: string): GraphNeighbors {
  return {
    entity: mockGraphZoneEntity(id),
    neighbors: [
      {
        edge: {
          source_kind: "zone",
          source_id: id,
          relation: "contains",
          target_kind: "sensor",
          target_id: "sensor-1",
          label: "contains Sensor",
        },
        entity: mockGraphSensorEntity,
      },
    ],
  };
}

function mockGraphSubgraph(id: string): GraphSubgraph {
  const neighbors = mockGraphNeighbors(id);
  return {
    nodes: [neighbors.entity, ...neighbors.neighbors.map((n) => n.entity)],
    edges: neighbors.neighbors.map((n) => n.edge),
  };
}

export const mockGraphSearchResult: GraphSearchResult = {
  query: "tank",
  results: [mockGraphZoneEntity(ZONE_A)],
};

export const mockGraphPath: GraphPath = {
  found: true,
  edges: [
    {
      source_kind: "recommendation",
      source_id: "a1|tier_critical",
      relation: "generated",
      target_kind: "risk_assessment",
      target_id: "a1",
      label: "generated",
    },
  ],
};

export const handlers = [
  http.get("http://localhost:8000/api/v1/risk/current", () => {
    return HttpResponse.json(mockCurrentRisk);
  }),
  http.get("http://localhost:8000/api/v1/risk/history/:zoneId", () => {
    return HttpResponse.json({
      items: mockRiskHistory,
      limit: 100,
      count: mockRiskHistory.length,
    });
  }),
  http.get("http://localhost:8000/api/v1/risk/assessment/:assessmentId", ({ params }) => {
    const match = mockCurrentRisk.find((a) => a.assessment_id === params.assessmentId);
    if (!match) {
      return HttpResponse.json(
        { error: { code: "ASSESSMENT_NOT_FOUND", message: "not found", details: null } },
        { status: 404 },
      );
    }
    return HttpResponse.json(match);
  }),
  http.get("http://localhost:8000/api/v1/permits", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    const items = status ? mockPermits.filter((permit) => permit.status === status) : mockPermits;
    return HttpResponse.json({ items, limit: 100, count: items.length });
  }),
  http.get("http://localhost:8000/api/v1/audit", () => {
    return HttpResponse.json({ items: mockAuditLog, limit: 100, count: 0 });
  }),
  http.get("http://localhost:8000/api/v1/zones", () => {
    return HttpResponse.json(mockZones);
  }),
  http.get("http://localhost:8000/api/v1/scenarios", () => {
    return HttpResponse.json(mockScenarios);
  }),
  http.get("http://localhost:8000/api/v1/scenarios/:key", ({ params }) => {
    const match = mockScenarios.find((s) => s.key === params.key);
    if (!match) {
      return HttpResponse.json(
        { error: { code: "SCENARIO_NOT_FOUND", message: "not found", details: null } },
        { status: 404 },
      );
    }
    return HttpResponse.json(match);
  }),
  http.get("http://localhost:8000/api/v1/counterfactual/:zoneId", () => {
    return HttpResponse.json(mockCounterfactual);
  }),
  http.get("http://localhost:8000/api/v1/zones/:zoneId/workers/count", ({ params }) => {
    return HttpResponse.json({ zone_id: params.zoneId, worker_count: 2 });
  }),
  http.get("http://localhost:8000/api/v1/historical/decks", () => {
    return HttpResponse.json(mockHistoricalDecks);
  }),
  http.get("http://localhost:8000/api/v1/historical/matches", () => {
    return HttpResponse.json(mockHistoricalMatches);
  }),
  http.get("http://localhost:8000/api/v1/historical/analytics", () => {
    return HttpResponse.json(mockHistoricalAnalytics);
  }),
  http.get("http://localhost:8000/api/v1/foresight/forecast", () => {
    return HttpResponse.json(mockForesightResult);
  }),
  http.get("http://localhost:8000/api/v1/graph/entity/:kind/:id", ({ params }) => {
    return HttpResponse.json(mockGraphZoneEntity(String(params.id)));
  }),
  http.get("http://localhost:8000/api/v1/graph/neighbors/:kind/:id", ({ params }) => {
    return HttpResponse.json(mockGraphNeighbors(String(params.id)));
  }),
  http.get("http://localhost:8000/api/v1/graph/subgraph/:kind/:id", ({ params }) => {
    return HttpResponse.json(mockGraphSubgraph(String(params.id)));
  }),
  http.get("http://localhost:8000/api/v1/graph/search", () => {
    return HttpResponse.json(mockGraphSearchResult);
  }),
  http.get("http://localhost:8000/api/v1/graph/path", () => {
    return HttpResponse.json(mockGraphPath);
  }),
];
