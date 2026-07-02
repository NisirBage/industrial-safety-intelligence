import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getCurrentRisk } from "../api/risk";
import { usePolling } from "../context/PollingContext";

/** Backs the Overview page and the zone picker - GET /risk/current. */
export function useCurrentRisk() {
  const { intervalMs, enabled } = usePolling();

  return useQuery({
    queryKey: ["risk", "current"],
    queryFn: getCurrentRisk,
    refetchInterval: enabled ? intervalMs : false,
    // Keeps the last successful list on screen while a poll is in
    // flight, rather than flashing a loading state every interval -
    // "avoid unnecessary re-renders" (M8 Polling requirement).
    placeholderData: keepPreviousData,
  });
}
