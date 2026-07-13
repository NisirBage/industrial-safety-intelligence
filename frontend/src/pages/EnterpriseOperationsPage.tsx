import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getReplay } from "../api/replay";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useScenarios } from "../hooks/useScenarios";
import { buildCorporateOverview, buildPlantSummary, type PlantSummary } from "../lib/multiPlant";

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  not_ready: "Not Ready",
};

/**
 * M27 Part 5 (Multi-Plant Command Center) - one card per cataloged
 * scenario, each standing in for a real facility (see multiPlant.ts's
 * own docstring for why - this platform's real data model has one
 * deck, and every zone/tick/assessment shown is genuinely real). The
 * corporate rollup at the top is a worst-of/sum-of aggregation over
 * these cards, never a new computation.
 */
export function EnterpriseOperationsPage() {
  const { data: scenarios, isLoading, error, refetch } = useScenarios();

  const replayQueries = useQueries({
    queries: (scenarios ?? []).map((scenario) => ({
      queryKey: ["replay", { scenarioKey: scenario.key }],
      queryFn: () => getReplay({ scenarioKey: scenario.key }),
      enabled: scenarios !== undefined,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const summaries: PlantSummary[] = (scenarios ?? [])
    .map((scenario, index) => {
      const replay = replayQueries[index]?.data;
      return replay ? buildPlantSummary(scenario, replay) : null;
    })
    .filter((summary): summary is PlantSummary => summary !== null);

  const overview = buildCorporateOverview(summaries);
  const stillLoading = replayQueries.some((q) => q.isLoading);

  return (
    <section>
      <h1>Enterprise Operations</h1>
      <p className="page-intro">
        Every cataloged scenario stands in for one facility, backed entirely by real, already
        persisted risk assessments - see the Deployment Readiness Assessment for why this platform
        presents a multi-plant view without fabricating additional plants.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!scenarios || scenarios.length === 0}
        emptyLabel="No scenarios cataloged."
        onRetry={() => refetch()}
      >
        <div className="card enterprise-corporate-overview">
          <h3>Corporate Overview</h3>
          <div className="enterprise-kpi-row">
            <div className="enterprise-kpi">
              <span className="enterprise-kpi-value">{overview.plantCount}</span>
              <span className="enterprise-kpi-label">Plants</span>
            </div>
            <div className="enterprise-kpi">
              <span className="enterprise-kpi-value">{overview.totalZones}</span>
              <span className="enterprise-kpi-label">Zones</span>
            </div>
            <div className="enterprise-kpi">
              <span className="enterprise-kpi-value">
                {overview.worstTier ? <TierBadge tier={overview.worstTier} /> : "—"}
              </span>
              <span className="enterprise-kpi-label">Enterprise Risk</span>
            </div>
            <div className="enterprise-kpi">
              <span className="enterprise-kpi-value">{overview.averageCompoundScore.toFixed(1)}</span>
              <span className="enterprise-kpi-label">Avg Compound Score</span>
            </div>
            <div className="enterprise-kpi">
              <span className="enterprise-kpi-value">{overview.totalIncidents}</span>
              <span className="enterprise-kpi-label">Incidents</span>
            </div>
            <div className="enterprise-kpi">
              <span className={`enterprise-readiness enterprise-readiness-${overview.readiness}`}>
                {READINESS_LABEL[overview.readiness]}
              </span>
              <span className="enterprise-kpi-label">Operational Readiness</span>
            </div>
          </div>
        </div>

        <div className="enterprise-plant-grid">
          {summaries.map((summary) => (
            <Link
              key={summary.scenarioKey}
              to={`/scenarios/${summary.scenarioKey}`}
              className={`card enterprise-plant-card enterprise-plant-${summary.readiness}`}
            >
              <div className="enterprise-plant-header">
                <h3>{summary.title}</h3>
                {summary.worstTier && <TierBadge tier={summary.worstTier} />}
              </div>
              <p>{summary.description}</p>
              <dl className="enterprise-plant-stats">
                <div>
                  <dt>Zones</dt>
                  <dd>{summary.zoneCount}</dd>
                </div>
                <div>
                  <dt>Ticks replayed</dt>
                  <dd>{summary.tickCount}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{summary.durationMinutes} min</dd>
                </div>
                <div>
                  <dt>Avg score</dt>
                  <dd>{summary.averageCompoundScore.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Incidents</dt>
                  <dd>{summary.incidentCount}</dd>
                </div>
                <div>
                  <dt>Readiness</dt>
                  <dd>{READINESS_LABEL[summary.readiness]}</dd>
                </div>
              </dl>
            </Link>
          ))}
          {stillLoading && summaries.length === 0 && <p>Loading plant data…</p>}
        </div>
      </QueryResult>
    </section>
  );
}
