import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getPermits } from "../api/permits";
import type { PermitsQuery } from "../api/types";
import { usePolling } from "../context/PollingContext";

/** Backs the Permit view - GET /permits. */
export function usePermits(query: PermitsQuery = {}) {
  const { intervalMs, enabled } = usePolling();

  return useQuery({
    queryKey: ["permits", query],
    queryFn: () => getPermits(query),
    refetchInterval: enabled ? intervalMs : false,
    placeholderData: keepPreviousData,
  });
}
