import { http, HttpResponse } from "msw";

import type { AuditLogEntry, Permit, RiskAssessment } from "../../api/types";

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
    justification: { schema_version: 1 },
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
  http.get("http://localhost:8000/api/v1/permits", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    const items = status ? mockPermits.filter((permit) => permit.status === status) : mockPermits;
    return HttpResponse.json({ items, limit: 100, count: items.length });
  }),
  http.get("http://localhost:8000/api/v1/audit", () => {
    return HttpResponse.json({ items: mockAuditLog, limit: 100, count: 0 });
  }),
];
