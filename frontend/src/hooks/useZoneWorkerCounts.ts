import { useQueries } from "@tanstack/react-query";

import { getZoneWorkerCount } from "../api/zones";

/** One `GET /zones/{zoneId}/workers/count` per zone - headcount
 * changes rarely, same staleTime rationale as `useZones`. */
export function useZoneWorkerCounts(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["zones", zoneId, "workers", "count"],
      queryFn: () => getZoneWorkerCount(zoneId),
      staleTime: 5 * 60 * 1000,
    })),
  });
}
