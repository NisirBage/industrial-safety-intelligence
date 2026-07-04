import { useQueries } from "@tanstack/react-query";

import { getCounterfactualComparison } from "../api/counterfactual";

/** One counterfactual comparison per zone, keyed by that zone's own
 * assessment timestamp - React Query's key-based caching means an
 * unchanged timestamp never refetches, only a real tick change does. */
export function useZoneCounterfactuals(zoneTimestamps: { zoneId: string; timestamp: string | null }[]) {
  return useQueries({
    queries: zoneTimestamps.map(({ zoneId, timestamp }) => ({
      queryKey: ["counterfactual", zoneId, timestamp],
      queryFn: () => getCounterfactualComparison(zoneId, timestamp as string),
      enabled: timestamp !== null,
    })),
  });
}
