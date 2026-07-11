import { apiGet } from "./client";
import type { ForesightResult } from "./types";

/** GET /api/v1/foresight/forecast - Operational Foresight (M25):
 * trajectory-matched forecast, confidence, progression, and early
 * warning for one zone's trailing window of persisted assessments.
 * Context and trend evidence only - the deterministic engine's own
 * risk/recommendation endpoints remain the sole source of "what to
 * do now." */
export function getForesightForecast(
  zoneId: string,
  timestamp: string,
  scenarioKey: string,
  options: { windowSize?: number; topN?: number; deckKey?: string } = {},
): Promise<ForesightResult> {
  return apiGet<ForesightResult>("/api/v1/foresight/forecast", {
    zone_id: zoneId,
    timestamp,
    scenario_key: scenarioKey,
    window_size: options.windowSize,
    top_n: options.topN,
    deck_key: options.deckKey,
  });
}
