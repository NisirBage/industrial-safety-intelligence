import { useQueries } from "@tanstack/react-query";

import { API_BASE_URL } from "../api/client";
import { getRiskHistory } from "../api/risk";
import { getZoneEquipment } from "../api/scenarioBuilder";
import { useHealth } from "../hooks/useHealth";
import { usePermits } from "../hooks/usePermits";
import { useScenarios } from "../hooks/useScenarios";
import { useWorkers } from "../hooks/useScenarioBuilder";
import { useZones } from "../hooks/useZones";

type Status = "green" | "yellow" | "red";

interface DiagnosticRow {
  label: string;
  status: Status;
  detail: string;
}

const HISTORY_LIMIT = 1000;

function StatusDot({ status }: { status: Status }) {
  return (
    <span className={`diagnostics-status diagnostics-status-${status}`} aria-hidden="true" />
  );
}

/**
 * M21 Part 2 (Self Diagnostics) - every row below is sourced from an
 * existing REST endpoint, never a new one (this milestone's hard
 * constraint: no API contract changes). Two metrics the brief asks
 * for - Last Seed Time and Sensor Reading Count - have no existing
 * endpoint to source them from (seeding leaves no timestamp marker
 * anywhere, and the only "sensor" endpoint returns configured sensors
 * per zone, not historical readings) - both are shown honestly as
 * unavailable rather than approximated or invented, per this
 * milestone's explicit instruction.
 */
export function DiagnosticsPage() {
  const health = useHealth();
  const { data: zones, isError: zonesFailed } = useZones();
  const { data: scenarios, isError: scenariosFailed } = useScenarios();
  const { data: permits, isError: permitsFailed } = usePermits({ limit: HISTORY_LIMIT });
  const { data: workers, isError: workersFailed } = useWorkers();
  const zoneIds = zones?.map((z) => z.zone_id) ?? [];

  const histories = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["risk", "history", zoneId, { limit: HISTORY_LIMIT }],
      queryFn: () => getRiskHistory(zoneId, { limit: HISTORY_LIMIT }),
      enabled: zoneIds.length > 0,
    })),
  });
  const equipmentQueries = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["zones", zoneId, "equipment"],
      queryFn: () => getZoneEquipment(zoneId),
      enabled: zoneIds.length > 0,
    })),
  });

  const historiesLoaded = histories.length > 0 && histories.every((q) => q.isSuccess);
  const historiesFailed = histories.length > 0 && histories.some((q) => q.isError);
  const equipmentLoaded = equipmentQueries.length > 0 && equipmentQueries.every((q) => q.isSuccess);
  const equipmentFailed = equipmentQueries.length > 0 && equipmentQueries.some((q) => q.isError);
  const riskAssessmentCount = historiesLoaded
    ? histories.reduce((sum, q) => sum + (q.data?.count ?? 0), 0)
    : null;
  const riskAssessmentCapped = historiesLoaded && histories.some((q) => q.data?.count === HISTORY_LIMIT);
  const equipmentCount = equipmentLoaded
    ? equipmentQueries.reduce((sum, q) => sum + (q.data?.length ?? 0), 0)
    : null;

  const systemRows: DiagnosticRow[] = [
    {
      label: "Backend",
      status: health.isSuccess && health.data.status === "ok" ? "green" : health.isLoading ? "yellow" : "red",
      detail: health.isSuccess
        ? `Status: "${health.data.status}"`
        : health.isLoading
          ? "Checking..."
          : "Unreachable - GET /api/v1/health failed.",
    },
    {
      label: "Database",
      status: health.isSuccess && health.data.database === "connected" ? "green" : health.isLoading ? "yellow" : "red",
      detail: health.isSuccess
        ? `Status: "${health.data.database}"${health.data.migration_version ? ` · schema ${health.data.migration_version}` : ""}`
        : health.isLoading
          ? "Checking..."
          : "Unknown - backend did not respond.",
    },
    {
      label: "REST API",
      status: zones !== undefined ? "green" : zonesFailed || health.isError ? "red" : "yellow",
      detail:
        zones !== undefined
          ? `GET /api/v1/zones reachable (${zones.length} zones).`
          : zonesFailed
            ? "Unavailable - GET /api/v1/zones failed."
            : "Awaiting a response.",
    },
    {
      label: "Replay Dataset",
      status: (scenarios?.length ?? 0) > 0 ? "green" : scenarios || scenariosFailed ? "red" : "yellow",
      detail: scenarios
        ? `${scenarios.length} scenario(s) in the catalog.`
        : scenariosFailed
          ? "Unavailable - GET /api/v1/scenarios failed."
          : "Checking...",
    },
    {
      label: "Frontend Build",
      status: "green",
      detail: `Mode: ${import.meta.env.MODE}${import.meta.env.DEV ? " (dev server)" : " (production build)"}`,
    },
  ];

  const countRows: (DiagnosticRow & { unavailable?: boolean })[] = [
    {
      label: "Version",
      status: "yellow",
      unavailable: true,
      detail: "Status: Unavailable — Reason: Not exposed by current REST API.",
    },
    {
      label: "Last Seed Time",
      status: "yellow",
      unavailable: true,
      detail: "Status: Unavailable — Reason: Not exposed by current REST API.",
    },
    {
      label: "Scenario Count",
      status: scenarios ? "green" : scenariosFailed ? "red" : "yellow",
      detail: scenarios ? `${scenarios.length}` : scenariosFailed ? "Unavailable - request failed." : "Loading...",
    },
    {
      label: "Permit Count",
      status: permits ? "green" : permitsFailed ? "red" : "yellow",
      detail: permits
        ? `${permits.count}${permits.count === HISTORY_LIMIT ? "+ (page limit reached)" : ""}`
        : permitsFailed
          ? "Unavailable - request failed."
          : "Loading...",
    },
    {
      label: "Risk Assessment Count",
      status: riskAssessmentCount !== null ? "green" : historiesFailed || zonesFailed ? "red" : "yellow",
      detail:
        riskAssessmentCount !== null
          ? `${riskAssessmentCount}${riskAssessmentCapped ? "+ (a zone hit the page limit)" : ""} across ${zoneIds.length} zone(s)`
          : historiesFailed
            ? "Unavailable - one or more per-zone history requests failed."
            : zonesFailed
              ? "Unavailable - GET /api/v1/zones failed, so no zones to query."
              : "Loading per-zone history...",
    },
    {
      label: "Sensor Reading Count",
      status: "yellow",
      unavailable: true,
      detail:
        "Status: Unavailable — Reason: Not exposed by current REST API (zone-sensor endpoints return configured sensors, not historical readings).",
    },
    {
      label: "Worker Count",
      status: workers ? "green" : workersFailed ? "red" : "yellow",
      detail: workers ? `${workers.length}` : workersFailed ? "Unavailable - request failed." : "Loading...",
    },
    {
      label: "Equipment Count",
      status: equipmentCount !== null ? "green" : equipmentFailed || zonesFailed ? "red" : "yellow",
      detail:
        equipmentCount !== null
          ? `${equipmentCount} across ${zoneIds.length} zone(s)`
          : equipmentFailed
            ? "Unavailable - one or more per-zone equipment requests failed."
            : zonesFailed
              ? "Unavailable - GET /api/v1/zones failed, so no zones to query."
              : "Loading...",
    },
  ];

  return (
    <section className="diagnostics-page">
      <h1>Diagnostics</h1>
      <p className="page-intro">
        Every value below comes from an existing read-only endpoint this platform already
        exposes - nothing here is a new API surface. Two metrics have no endpoint to source them
        from and are disclosed as unavailable rather than approximated.
      </p>

      <h2 className="section-heading">System Status</h2>
      <div className="card-grid">
        {systemRows.map((row) => (
          <div key={row.label} className="card diagnostics-card">
            <div className="diagnostics-card-header">
              <StatusDot status={row.status} />
              <h3>{row.label}</h3>
            </div>
            <p className="kpi-sub">{row.detail}</p>
          </div>
        ))}
      </div>

      <h2 className="section-heading">Data Counts</h2>
      <p className="kpi-sub">API base URL: {API_BASE_URL}</p>
      <div className="card-grid">
        {countRows.map((row) => (
          <div key={row.label} className={`card diagnostics-card ${row.unavailable ? "diagnostics-card-unavailable" : ""}`}>
            <div className="diagnostics-card-header">
              <StatusDot status={row.status} />
              <h3>{row.label}</h3>
            </div>
            <p className={row.unavailable ? "diagnostics-unavailable-text" : "kpi-value"}>{row.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
