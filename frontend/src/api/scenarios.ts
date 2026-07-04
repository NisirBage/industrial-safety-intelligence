import { apiGet } from "./client";
import type { ScenarioSummary } from "./types";

/** GET /api/v1/scenarios - the scenario library, Decision Intelligence Layer. */
export function getScenarios(): Promise<ScenarioSummary[]> {
  return apiGet<ScenarioSummary[]>("/api/v1/scenarios");
}

/** GET /api/v1/scenarios/{key}. */
export function getScenario(key: string): Promise<ScenarioSummary> {
  return apiGet<ScenarioSummary>(`/api/v1/scenarios/${key}`);
}
