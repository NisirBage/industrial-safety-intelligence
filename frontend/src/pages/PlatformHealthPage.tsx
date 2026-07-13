import { QueryResult } from "../components/common/QueryResult";
import { usePlatformHealth } from "../hooks/useHealth";

const STATUS_LABEL: Record<string, string> = {
  ok: "Healthy",
  degraded: "Degraded",
  error: "Error",
};

/**
 * M27 Part 6 (Enterprise Health Dashboard) - every row below comes
 * straight from GET /api/v1/health/platform, which itself runs a
 * cheap, real, read-only check against each subsystem (database,
 * replay/scenario catalog, historical decks, foresight's inputs,
 * knowledge graph vocabulary, storage, live-ingestion connectors) -
 * nothing here is simulated or assumed healthy.
 */
export function PlatformHealthPage() {
  const { data, isLoading, error, dataUpdatedAt, refetch } = usePlatformHealth();

  return (
    <section>
      <h1>Platform Health</h1>
      <p className="page-intro">
        Live status for every subsystem this platform actually has, polled every 5 seconds.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={false}
        emptyLabel=""
        onRetry={() => refetch()}
      >
        {data && (
          <>
            <div className="card enterprise-health-summary">
              <div className={`enterprise-health-overall enterprise-health-${data.status}`}>
                {STATUS_LABEL[data.status] ?? data.status}
              </div>
              <dl className="enterprise-health-meta">
                <div>
                  <dt>Version</dt>
                  <dd>{data.version}</dd>
                </div>
                <div>
                  <dt>Check latency</dt>
                  <dd>{data.latency_ms.toFixed(2)} ms</dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}</dd>
                </div>
              </dl>
            </div>

            <div className="card-grid">
              {data.checks.map((check) => (
                <div key={check.name} className="card enterprise-health-card">
                  <div className="enterprise-health-card-header">
                    <h3>{check.name}</h3>
                    <span className={`enterprise-health-badge enterprise-health-${check.status}`}>
                      {STATUS_LABEL[check.status] ?? check.status}
                    </span>
                  </div>
                  <p className="kpi-sub">{check.detail}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </QueryResult>
    </section>
  );
}
