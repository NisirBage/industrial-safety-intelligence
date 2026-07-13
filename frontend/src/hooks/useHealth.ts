import { useQuery } from "@tanstack/react-query";

import { getHealth, getPlatformHealth } from "../api/health";

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

/** M27 Part 6 (Enterprise Health Dashboard) - polled so the dashboard
 * reflects subsystem status as it changes, same cadence as the Live
 * Integration Hub's connector status poll. */
export function usePlatformHealth() {
  return useQuery({
    queryKey: ["health", "platform"],
    queryFn: getPlatformHealth,
    refetchInterval: 5000,
    retry: false,
  });
}
