import { useQuery } from "@tanstack/react-query";

import { getHistoricalAnalytics } from "../api/historical";

/** Deterministic cross-scenario analytics - static aggregation over
 * already-persisted rows, no polling needed. */
export function useHistoricalAnalytics(deckKey?: string) {
  return useQuery({
    queryKey: ["historical", "analytics", deckKey],
    queryFn: () => getHistoricalAnalytics(deckKey),
    staleTime: 5 * 60 * 1000,
  });
}
