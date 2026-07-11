import { useQuery } from "@tanstack/react-query";

import { getHistoricalMatches } from "../api/historical";

/** Top similar historical incidents for one zone's exact persisted
 * assessment timestamp - a point-in-time lookup (like
 * useCounterfactualComparison), not a live-polled value. */
export function useHistoricalMatches(
  zoneId: string | undefined,
  timestamp: string | undefined,
  options: { topN?: number; deckKey?: string } = {},
) {
  return useQuery({
    queryKey: ["historical", "matches", zoneId, timestamp, options.topN, options.deckKey],
    queryFn: () => getHistoricalMatches(zoneId as string, timestamp as string, options),
    enabled: zoneId !== undefined && timestamp !== undefined,
  });
}
