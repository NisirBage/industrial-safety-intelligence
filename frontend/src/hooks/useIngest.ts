import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getConnectorStatus, pollMockConnector } from "../api/ingest";

/** Backs the Live Integration Hub - GET /ingest/status. Polled like
 * other live pages so the in-process ingestion counters stay current. */
export function useConnectorStatus() {
  return useQuery({
    queryKey: ["ingest", "status"],
    queryFn: getConnectorStatus,
    refetchInterval: 5000,
  });
}

/** Triggers one simulated MQTT/OPC-UA message, then invalidates the
 * connector status query so its counters reflect the new reading. */
export function usePollMockConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      protocol,
      zoneId,
      gasType,
      timestamp,
    }: {
      protocol: "mqtt" | "opcua";
      zoneId: string;
      gasType: string;
      timestamp: string;
    }) => pollMockConnector(protocol, { zone_id: zoneId, gas_type: gasType, timestamp }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ingest", "status"] });
    },
  });
}
