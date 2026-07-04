import { apiGet } from "./client";
import type { ReplayData } from "./types";

export interface ReplayTarget {
  scenarioKey?: string;
  zoneIds?: string[];
  start?: string;
  end?: string;
}

/** GET /api/v1/replay - the Time Machine's single data source. Either
 * a scenario key or an explicit zone_ids+start+end window (e.g. a
 * Scenario Builder execution result, never saved to the catalog). */
export function getReplay(target: ReplayTarget): Promise<ReplayData> {
  if (target.scenarioKey) {
    return apiGet<ReplayData>("/api/v1/replay", { scenario_key: target.scenarioKey });
  }
  return apiGet<ReplayData>("/api/v1/replay", {
    zone_ids: (target.zoneIds ?? []).join(","),
    start: target.start,
    end: target.end,
  });
}
