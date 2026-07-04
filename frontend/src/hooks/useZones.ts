import { useQuery } from "@tanstack/react-query";

import { getZones } from "../api/zones";

/** Zone metadata rarely changes - no polling needed here, unlike the
 * risk/permit/audit hooks (usePolling isn't used). */
export function useZones() {
  return useQuery({
    queryKey: ["zones"],
    queryFn: getZones,
    staleTime: 5 * 60 * 1000,
  });
}
