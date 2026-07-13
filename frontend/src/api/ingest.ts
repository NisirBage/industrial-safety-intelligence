import { apiGet, apiPost } from "./client";
import type { ConnectorStatusResponse, IngestReadingResponse } from "./types";

/** GET /api/v1/ingest/status - Live Integration Hub connector status. */
export function getConnectorStatus(): Promise<ConnectorStatusResponse> {
  return apiGet<ConnectorStatusResponse>("/api/v1/ingest/status");
}

/** POST /api/v1/ingest/mock/{protocol} - simulate one inbound message
 * from the mocked MQTT/OPC-UA connector for a given zone/gas type. */
export function pollMockConnector(
  protocol: "mqtt" | "opcua",
  body: { zone_id: string; gas_type: string; timestamp: string },
): Promise<IngestReadingResponse> {
  return apiPost<IngestReadingResponse>(`/api/v1/ingest/mock/${protocol}`, body);
}

/** POST /api/v1/ingest/reading - real REST ingestion of one sensor reading. */
export function ingestReading(body: {
  sensor_id: string;
  value: number;
  unit: string;
  timestamp: string;
  quality_flag?: string;
}): Promise<IngestReadingResponse> {
  return apiPost<IngestReadingResponse>("/api/v1/ingest/reading", body);
}
