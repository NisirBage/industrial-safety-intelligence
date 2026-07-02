import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getRiskHistory } from "../api/risk";
import type { HistoryQuery } from "../api/types";
import { usePolling } from "../context/PollingContext";

/** Backs the Zone view's historical chart - GET /risk/history/{zoneId}. */
export function useRiskHistory(zoneId: string | undefined, query: HistoryQuery = {}) {
  const { intervalMs, enabled } = usePolling();

  return useQuery({
    queryKey: ["risk", "history", zoneId, query],
    queryFn: () => getRiskHistory(zoneId as string, query),
    enabled: zoneId !== undefined,
    refetchInterval: enabled ? intervalMs : false,
    placeholderData: keepPreviousData,
  });
}
