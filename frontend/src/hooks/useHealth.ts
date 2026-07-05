import { useQuery } from "@tanstack/react-query";

import { getHealth } from "../api/health";

/** Part 9 (Demo Readiness) - a fresh, unpolled health check. No
 * retries: a failed check should surface immediately, not blend into
 * a retry backoff before the judge notices. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
    staleTime: 0,
  });
}
