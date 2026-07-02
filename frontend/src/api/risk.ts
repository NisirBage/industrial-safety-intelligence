import { apiGet } from "./client";
import type { HistoryQuery, Paginated, RiskAssessment } from "./types";

/** GET /api/v1/risk/current - one row per zone, the plant-wide snapshot. */
export function getCurrentRisk(): Promise<RiskAssessment[]> {
  return apiGet<RiskAssessment[]>("/api/v1/risk/current");
}

/** GET /api/v1/risk/history/{zoneId} - paginated, newest first. */
export function getRiskHistory(
  zoneId: string,
  query: HistoryQuery = {},
): Promise<Paginated<RiskAssessment>> {
  return apiGet<Paginated<RiskAssessment>>(
    `/api/v1/risk/history/${zoneId}`,
    query,
  );
}
