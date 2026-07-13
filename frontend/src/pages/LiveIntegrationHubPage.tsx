import { useState } from "react";

import { QueryResult } from "../components/common/QueryResult";
import { useConnectorStatus, usePollMockConnector } from "../hooks/useIngest";
import { useZoneSensors } from "../hooks/useScenarioBuilder";
import { useZones } from "../hooks/useZones";
import { zoneLabel } from "../lib/format";

/**
 * M27 Part 4 (Live Data Connectors) - the Live Integration Hub:
 * real-vs-mocked connector status, plus a "simulate one message"
 * trigger for the mocked MQTT/OPC-UA adapters against a real,
 * already-existing sensor. Every value here is either the backend's
 * own honest self-report (`GET /ingest/status`) or a real reading
 * this page just caused to be persisted - nothing fabricated.
 */
export function LiveIntegrationHubPage() {
  const { data: status, isLoading, error, refetch } = useConnectorStatus();
  const { data: zones } = useZones();
  const [zoneId, setZoneId] = useState<string>("");
  const { data: sensors } = useZoneSensors(zoneId || undefined);
  const [gasType, setGasType] = useState<string>("");
  const pollMock = usePollMockConnector();

  function handlePoll(protocol: "mqtt" | "opcua") {
    if (!zoneId || !gasType) {
      return;
    }
    pollMock.mutate({ protocol, zoneId, gasType, timestamp: new Date().toISOString() });
  }

  return (
    <section>
      <h1>Live Integration Hub</h1>
      <p className="page-intro">
        Real and mocked connectors that feed the same sensor-reading pipeline the simulator
        already writes to. The deterministic engine is unchanged - it picks up any newly ingested
        reading on its own next scheduled tick.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!status || status.connectors.length === 0}
        emptyLabel="No connectors configured."
        onRetry={() => refetch()}
      >
        <div className="connector-grid">
          {status?.connectors.map((connector) => (
            <div key={connector.name} className={`card connector-card connector-${connector.mode}`}>
              <div className="connector-card-header">
                <h3>{connector.name}</h3>
                <span className={`connector-badge connector-badge-${connector.mode}`}>
                  {connector.mode === "implemented" ? "Implemented" : "Mocked"}
                </span>
              </div>
              <p className="connector-protocol">{connector.protocol}</p>
              <p>{connector.description}</p>
              <p className="connector-count">
                Readings ingested this process: {connector.readings_ingested_this_process}
              </p>
            </div>
          ))}
        </div>
      </QueryResult>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3>Simulate a mocked connector message</h3>
        <p>
          Pick a zone and one of its real monitored gas types, then trigger a simulated MQTT or
          OPC-UA message - a deterministic reading derived from that sensor's own real alarm
          threshold, written through the same ingestion path as a real connector.
        </p>
        <div className="connector-simulate-form">
          <label>
            Zone
            <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
              <option value="">Select a zone…</option>
              {zones?.map((zone) => (
                <option key={zone.zone_id} value={zone.zone_id}>
                  {zoneLabel(zone.zone_id, zones)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gas type
            <select value={gasType} onChange={(event) => setGasType(event.target.value)}>
              <option value="">Select a gas type…</option>
              {sensors?.map((sensor) => (
                <option key={sensor.sensor_id} value={sensor.gas_type}>
                  {sensor.gas_type}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => handlePoll("mqtt")}
            disabled={!zoneId || !gasType || pollMock.isPending}
          >
            Simulate MQTT message
          </button>
          <button
            type="button"
            onClick={() => handlePoll("opcua")}
            disabled={!zoneId || !gasType || pollMock.isPending}
          >
            Simulate OPC-UA message
          </button>
        </div>
        {pollMock.isSuccess && (
          <p className="connector-simulate-result">
            Ingested a reading of {pollMock.data.value.toFixed(1)} {pollMock.data.unit} at{" "}
            {pollMock.data.timestamp}.
          </p>
        )}
        {pollMock.isError && (
          <p className="connector-simulate-error">Could not simulate a message for that sensor.</p>
        )}
      </div>
    </section>
  );
}
