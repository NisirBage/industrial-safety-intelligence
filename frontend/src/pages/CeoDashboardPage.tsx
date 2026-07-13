import { QueryResult } from "../components/common/QueryResult";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { useHistoricalMatches } from "../hooks/useHistoricalMatches";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue } from "../lib/actionPlaybook";
import { buildCeoDashboard } from "../lib/ceoDashboard";
import { highestRiskZone } from "../lib/executiveKpis";
import { zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";

/**
 * M27 Part 9 (Executive/CEO Mode) - one screen, no engineering
 * vocabulary (no tier badges as the primary framing, no rule ids, no
 * agent names), for the single zone this platform's own severity
 * ranking already considers most urgent right now (`highestRiskZone`,
 * the same selection `ExecutiveOverviewPage`'s "Current Incident" card
 * already uses). Deliberately live-only, not Time-Machine-replay-aware
 * like the Executive Overview page - a CEO screen is about "what's the
 * situation right now", and Time Machine already exists as the
 * dedicated place to scrub history.
 */
export function CeoDashboardPage() {
  const { data: liveAssessments, isLoading, error, refetch } = useCurrentRisk();
  const { data: zones } = useZones();

  const entries = (liveAssessments ?? []).map((assessment) => ({
    zoneId: assessment.zone_id,
    assessment,
  }));
  const topZone = highestRiskZone(entries);

  const workerCounts = useZoneWorkerCounts(topZone ? [topZone.zoneId] : []);
  const workersAffected = workerCounts[0]?.data?.worker_count ?? 0;

  const { data: historicalMatches } = useHistoricalMatches(
    topZone?.zoneId,
    topZone?.assessment.timestamp,
  );
  const bestMatch = historicalMatches?.matches[0];

  const justification = topZone ? parseJustification(topZone.assessment.justification) : null;
  const recommendations = topZone ? deriveRecommendations(topZone.assessment.tier, justification) : [];
  const topAction = topZone ? buildActionQueue(recommendations, justification)[0] : undefined;

  const dashboard = topZone
    ? buildCeoDashboard(
        topZone.assessment,
        justification,
        recommendations,
        topAction,
        workersAffected,
        bestMatch,
      )
    : null;

  return (
    <section className="ceo-dashboard">
      <h1>Executive Summary</h1>
      <p className="page-intro">
        The single most urgent situation right now, in plain business terms.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!topZone || !dashboard}
        emptyLabel="No active situation - every zone is currently operating normally."
        onRetry={() => refetch()}
      >
        {topZone && dashboard && (
          <div className="ceo-dashboard-grid">
            <div className="card ceo-dashboard-card ceo-dashboard-card-wide">
              <h3>Current Situation</h3>
              <p className="ceo-dashboard-value">{dashboard.currentSituation}</p>
              <p className="kpi-sub">Location: {zoneLabel(topZone.zoneId, zones)}</p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Business Risk</h3>
              <p className={`ceo-dashboard-value ceo-risk-${dashboard.businessRisk.level.toLowerCase()}`}>
                {dashboard.businessRisk.level}
              </p>
              <p className="kpi-sub">{dashboard.businessRisk.description}</p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Operational Risk</h3>
              <p className="ceo-dashboard-value">{dashboard.operationalRiskLabel}</p>
              <p className="kpi-sub">Severity score: {dashboard.operationalRiskScore.toFixed(0)} / 100</p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Estimated Downtime</h3>
              <p className="ceo-dashboard-value">
                {dashboard.estimatedDowntime.sourced ? dashboard.estimatedDowntime.text : "Not available"}
              </p>
              <p className="kpi-sub">
                {dashboard.estimatedDowntime.sourced
                  ? "Based on the closest comparable historical incident."
                  : dashboard.estimatedDowntime.text}
              </p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Workers Affected</h3>
              <p className="ceo-dashboard-value">{dashboard.workersAffected}</p>
              <p className="kpi-sub">Headcount in the affected zone</p>
            </div>

            <div className="card ceo-dashboard-card ceo-dashboard-card-wide">
              <h3>Recommended Decision</h3>
              <p className="ceo-dashboard-value">{dashboard.recommendedDecision}</p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Confidence</h3>
              <p className="ceo-dashboard-value">{dashboard.confidencePercent}%</p>
            </div>

            <div className="card ceo-dashboard-card">
              <h3>Expected Outcome</h3>
              <p className="ceo-dashboard-value">{dashboard.expectedOutcome}</p>
            </div>
          </div>
        )}
      </QueryResult>
    </section>
  );
}
