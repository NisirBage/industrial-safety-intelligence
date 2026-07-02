import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getAuditLog } from "../api/audit";
import type { AuditQuery } from "../api/types";
import { usePolling } from "../context/PollingContext";

/** Backs the Audit view - GET /audit. */
export function useAuditLog(query: AuditQuery = {}) {
  const { intervalMs, enabled } = usePolling();

  return useQuery({
    queryKey: ["audit", query],
    queryFn: () => getAuditLog(query),
    refetchInterval: enabled ? intervalMs : false,
    placeholderData: keepPreviousData,
  });
}
