import { useQuery } from "@tanstack/react-query";

import { getForesightForecast } from "../api/foresight";

/** Operational Foresight for one zone's exact persisted assessment
 * timestamp - a point-in-time lookup (like useHistoricalMatches), not
 * a live-polled value. */
export function useForesightForecast(
  zoneId: string | undefined,
  timestamp: string | undefined,
  scenarioKey: string | undefined,
  options: { windowSize?: number; topN?: number; deckKey?: string } = {},
) {
  return useQuery({
    queryKey: [
      "foresight",
      "forecast",
      zoneId,
      timestamp,
      scenarioKey,
      options.windowSize,
      options.topN,
      options.deckKey,
    ],
    queryFn: () =>
      getForesightForecast(zoneId as string, timestamp as string, scenarioKey as string, options),
    enabled: zoneId !== undefined && timestamp !== undefined && scenarioKey !== undefined,
  });
}
