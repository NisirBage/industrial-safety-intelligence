import { API_BASE_URL, ApiError } from "../../api/client";
import type { RiskAssessment, ScenarioSummary } from "../../api/types";
import { useHealth } from "../../hooks/useHealth";
import { PLATFORM_STATS, PRESENTATION_SCENES } from "../../lib/presentationScript";

interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

interface DemoReadinessPanelProps {
  scenarios: ScenarioSummary[] | undefined;
  currentRisk: RiskAssessment[] | undefined;
}

/**
 * Part 9 (Demo Reliability) - "must display exactly what's missing,
 * never fail silently." Every check below reads data this page
 * already fetches (or a single extra `GET /api/v1/health`) - nothing
 * here is a new computation, just a pass/fail read of real state.
 * "Frontend connected" and "Backend running" look like the same
 * thing but are genuinely distinct failure modes: a network-level
 * error (wrong URL, CORS, backend process down) fails the transport
 * check before a response ever exists, while a reachable backend can
 * still report its own top-level status as "error" (e.g. an
 * unmigrated schema) independent of the database sub-check.
 */
export function DemoReadinessPanel({ scenarios, currentRisk }: DemoReadinessPanelProps) {
  const health = useHealth();

  const networkReachable =
    health.isSuccess || (health.isError && health.error instanceof ApiError && health.error.status !== null);

  const configOk = /^https?:\/\/.+/.test(API_BASE_URL);

  const checks: ReadinessCheck[] = [
    {
      label: "Frontend configured",
      ok: configOk,
      detail: configOk
        ? `API base URL: ${API_BASE_URL}`
        : `VITE_API_BASE_URL is not a valid URL ("${API_BASE_URL}") - check the frontend's .env file.`,
    },
    {
      label: "Frontend connected to backend",
      ok: networkReachable,
      detail: networkReachable
        ? "API reachable at the configured base URL."
        : "Could not reach the backend at all - check VITE_API_BASE_URL and that the backend process is running.",
    },
    {
      label: "Backend running",
      ok: health.isSuccess && health.data.status === "ok",
      detail: health.isSuccess
        ? `Reported status: "${health.data.status}".`
        : "No healthy response from GET /api/v1/health.",
    },
    {
      label: "Database connected",
      ok: health.isSuccess && health.data.database === "connected",
      detail: health.isSuccess
        ? `Database: "${health.data.database}"${health.data.migration_version ? ` (migration ${health.data.migration_version})` : ""}.`
        : "Database status unknown - backend did not respond.",
    },
    {
      label: "Replay available",
      ok: (scenarios?.length ?? 0) > 0,
      detail:
        (scenarios?.length ?? 0) > 0
          ? `${scenarios?.length} scenario(s) in the catalog.`
          : "GET /api/v1/scenarios returned no scenarios - Presentation Mode has nothing to replay.",
    },
    {
      label: "Safety assessments present",
      ok: (currentRisk?.length ?? 0) > 0,
      detail:
        (currentRisk?.length ?? 0) > 0
          ? `${currentRisk?.length} zone assessment(s) available.`
          : "GET /api/v1/risk/current returned no assessments - the plant snapshot scene will be empty.",
    },
    {
      label: "Presentation assets loaded",
      ok: PRESENTATION_SCENES.length > 0 && PLATFORM_STATS.length > 0,
      detail: `${PRESENTATION_SCENES.length} scenes, ${PLATFORM_STATS.length} platform stats bundled.`,
    },
  ];

  const allReady = checks.every((c) => c.ok);
  const failingCount = checks.filter((c) => !c.ok).length;

  return (
    <div className={`demo-readiness-panel ${allReady ? "demo-readiness-ready" : "demo-readiness-not-ready"}`}>
      <p className="demo-readiness-summary">
        {allReady
          ? "Demo Ready - all systems go."
          : `${failingCount} issue${failingCount === 1 ? "" : "s"} found - fix before presenting.`}
      </p>
      <ul className="demo-readiness-list">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "demo-readiness-ok" : "demo-readiness-fail"}>
            <span className="demo-readiness-icon" aria-hidden="true">
              {check.ok ? "✓" : "✗"}
            </span>
            <span className="demo-readiness-label">{check.label}</span>
            <span className="demo-readiness-detail">{check.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
