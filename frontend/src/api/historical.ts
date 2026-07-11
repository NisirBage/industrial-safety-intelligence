import { apiGet } from "./client";
import type {
  CrossScenarioAnalytics,
  HistoricalDeck,
  IncidentMatchesResult,
} from "./types";

/** GET /api/v1/historical/decks - every deck this platform has real
 * incident data for (M24: currently one honest deck, see
 * src/historical/decks.py). Static metadata, no polling needed. */
export function getHistoricalDecks(): Promise<HistoricalDeck[]> {
  return apiGet<HistoricalDeck[]>("/api/v1/historical/decks");
}

/** GET /api/v1/historical/matches - top similar historical incidents
 * for one zone's exact persisted assessment timestamp. Context only:
 * the deterministic engine's own risk/current /risk/history endpoints
 * remain the sole source of an operational recommendation. */
export function getHistoricalMatches(
  zoneId: string,
  timestamp: string,
  options: { topN?: number; deckKey?: string } = {},
): Promise<IncidentMatchesResult> {
  return apiGet<IncidentMatchesResult>("/api/v1/historical/matches", {
    zone_id: zoneId,
    timestamp,
    top_n: options.topN,
    deck_key: options.deckKey,
  });
}

/** GET /api/v1/historical/analytics - deterministic cross-scenario
 * aggregation (most common causes/equipment issues/permit
 * conflicts/worker hazards, average resolution time). */
export function getHistoricalAnalytics(deckKey?: string): Promise<CrossScenarioAnalytics> {
  return apiGet<CrossScenarioAnalytics>("/api/v1/historical/analytics", {
    deck_key: deckKey,
  });
}
