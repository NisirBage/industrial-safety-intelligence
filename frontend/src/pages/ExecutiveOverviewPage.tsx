import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { getRiskHistory } from "../api/risk";
import { MiniSparkline } from "../components/common/MiniSparkline";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { TrendIndicator } from "../components/zone/TrendIndicator";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import {
  averageCompoundScore,
  countTodaysIncidents,
  highestRiskZone,
  percentZonesNormal,
  plantReadiness,
} from "../lib/executiveKpis";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations, type Recommendation } from "../lib/recommendations";
import { latestTimestamp, tierRank, worstTier } from "../lib/tier";

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  not_ready: "Not Ready",
};

const HISTORY_LIMIT = 20;
const SEVERITY_ORDER = ["critical", "high", "medium"] as const;

interface ZonePriorityAction extends Recommendation {
  zoneId: string;
}

function useAllZoneHistories(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["risk", "history", zoneId, { limit: HISTORY_LIMIT }],
      queryFn: () => getRiskHistory(zoneId, { limit: HISTORY_LIMIT }),
    })),
  });
}

/**
 * Item 5 (executive KPI dashboard) - 8 named cards, each derived
 * entirely from already-existing endpoints: `/risk/current` (tier,
 * score, confidence, justification per zone), `/risk/history/{zone}`
 * (sparkline/trend), `/permits`, `/zones/{zone}/workers/count`
 * (M11.0), and `/counterfactual/{zone}` for the same tick each zone
 * is already on. Nothing here is a new risk computation - every
 * number is a count, average, or comparison over values the backend
 * already returned.
 */
export function ExecutiveOverviewPage() {
  const { data, isLoading, error } = useCurrentRisk();
  const { data: zones } = useZones();
  const zoneAssessments = data ?? [];
  const zoneIds = useMemo(() => (data ?? []).map((zone) => zone.zone_id), [data]);

  const histories = useAllZoneHistories(zoneIds);
  const nonNormalZoneIds = zoneAssessments
    .filter((zone) => zone.tier !== "normal")
    .map((zone) => zone.zone_id);
  const workerCounts = useZoneWorkerCounts(nonNormalZoneIds);
  const counterfactuals = useZoneCounterfactuals(
    zoneAssessments.map((zone) => ({ zoneId: zone.zone_id, timestamp: zone.timestamp })),
  );

  const active = usePermits({ status: "active" });
  const flagged = usePermits({ status: "flagged" });
  const suspendRecommended = usePermits({ status: "suspend_recommended" });

  const plantTier = worstTier(zoneAssessments.map((zone) => zone.tier));
  const lastUpdate = latestTimestamp(zoneAssessments.map((zone) => zone.timestamp));

  const zoneEntries = zoneAssessments.map((assessment) => ({
    zoneId: assessment.zone_id,
    assessment,
  }));
  const topZone = highestRiskZone(zoneEntries);
  const topZoneIndex = topZone ? zoneIds.indexOf(topZone.zoneId) : -1;
  const topZoneHistory = topZoneIndex >= 0 ? (histories[topZoneIndex]?.data?.items ?? []) : [];
  const topZoneSparkline = [...topZoneHistory].reverse().map((item) => item.compound_risk_score);
  const topZonePrevious = topZoneHistory[1]?.compound_risk_score;

  const criticalZoneIds = new Set(
    zoneAssessments.filter((zone) => zone.tier === "critical").map((zone) => zone.zone_id),
  );
  const activeCriticalPermits = (active.data?.items ?? []).filter((permit) =>
    criticalZoneIds.has(permit.zone_id),
  ).length;

  const workersExposed = nonNormalZoneIds.reduce((sum, _zoneId, index) => {
    return sum + (workerCounts[index]?.data?.worker_count ?? 0);
  }, 0);

  const avgScore = averageCompoundScore(zoneAssessments);
  const avgPreviousScore = averageCompoundScore(
    zoneAssessments.map((assessment, index) => histories[index]?.data?.items?.[1] ?? assessment),
  );

  const counterfactualMisses = zoneAssessments.filter((assessment, index) => {
    const comparison = counterfactuals[index]?.data;
    return comparison && assessment.tier !== "normal" && !comparison.counterfactual.alert;
  }).length;

  const allHistoryItems = zoneIds.flatMap((_zoneId, index) => histories[index]?.data?.items ?? []);
  const todaysIncidents = countTodaysIncidents(allHistoryItems, new Date());

  const openRecommendations = zoneAssessments.reduce((sum, assessment) => {
    const justification = parseJustification(assessment.justification);
    return sum + deriveRecommendations(assessment.tier, justification).length;
  }, 0);

  const priorityActions: ZonePriorityAction[] = zoneAssessments
    .flatMap((zone) => {
      const justification = parseJustification(zone.justification);
      return deriveRecommendations(zone.tier, justification).map((recommendation) => ({
        ...recommendation,
        zoneId: zone.zone_id,
      }));
    })
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  /** M12.5 (Executive Command Center) - Plant Readiness and Active
   * Alerts both re-derive from the same `zoneAssessments` every other
   * card on this page already reads; readiness is a threshold over
   * tier, not a new score, and the alert list is just those
   * assessments' own tier/score, sorted by the same severity ranking
   * `worstTier` uses. */
  const readiness = plantReadiness(zoneAssessments);
  const normalPercent = percentZonesNormal(zoneAssessments);
  const activeAlerts = zoneAssessments
    .filter((zone) => zone.tier !== "normal")
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier));

  return (
    <section>
      <h1>Executive Overview</h1>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={zoneAssessments.length === 0}
        emptyLabel="No risk assessments have been recorded yet."
      >
        {/* Primary row - the three facts an executive needs first:
            is the plant safe, is it ready to operate, and what's the
            one thing happening right now. Everything else is
            supporting detail, visually demoted below. */}
        <div className="kpi-grid kpi-grid-primary">
          <div className="card kpi-card kpi-card-primary">
            <h3>Safety Status</h3>
            <p className="kpi-value">{plantTier ? <TierBadge tier={plantTier} /> : "—"}</p>
            <p className="kpi-sub">Last update: {lastUpdate ? formatTimestamp(lastUpdate) : "—"}</p>
          </div>

          <div className={`card kpi-card kpi-card-primary plant-readiness-${readiness}`}>
            <h3>Operational Readiness</h3>
            <p className="kpi-value">{READINESS_LABEL[readiness]}</p>
            <p className="kpi-sub">{normalPercent.toFixed(0)}% of zones at NORMAL</p>
          </div>

          <div className="card kpi-card kpi-card-primary">
            <h3>Current Incident</h3>
            {topZone ? (
              <>
                <p className="kpi-value">{zoneLabel(topZone.zoneId, zones)}</p>
                <p className="kpi-sub">
                  {topZone.assessment.compound_risk_score.toFixed(1)}{" "}
                  <TierBadge tier={topZone.assessment.tier} />{" "}
                  <TrendIndicator
                    current={topZone.assessment.compound_risk_score}
                    previous={topZonePrevious}
                  />
                </p>
                {topZoneSparkline.length > 1 && <MiniSparkline values={topZoneSparkline} />}
              </>
            ) : (
              <p className="kpi-value">No active incident</p>
            )}
          </div>
        </div>

        <h2 className="section-heading">Supporting Metrics</h2>
        <div className="kpi-grid">
          <div className="card kpi-card">
            <h3>Active Critical Permits</h3>
            <p className="kpi-value">{activeCriticalPermits}</p>
            <p className="kpi-sub">Active permits in zones currently at CRITICAL</p>
          </div>

          <div className="card kpi-card">
            <h3>Workers Exposed</h3>
            <p className="kpi-value">{workersExposed}</p>
            <p className="kpi-sub">Headcount in zones currently above NORMAL</p>
          </div>

          <div className="card kpi-card">
            <h3>Average Compound Score</h3>
            <p className="kpi-value">
              {avgScore.toFixed(1)} <TrendIndicator current={avgScore} previous={avgPreviousScore} />
            </p>
            <p className="kpi-sub">Mean across every reporting zone</p>
          </div>

          <div className="card kpi-card">
            <h3>Legacy System Blind Spots</h3>
            <p className="kpi-value">{counterfactualMisses}</p>
            <p className="kpi-sub">Zones where a naive single-sensor alarm misses the current escalation</p>
          </div>

          <div className="card kpi-card">
            <h3>Today&apos;s Incidents</h3>
            <p className="kpi-value">{todaysIncidents}</p>
            <p className="kpi-sub">Tier escalations recorded today, across every zone</p>
          </div>

          <div className="card kpi-card">
            <h3>Open Actions</h3>
            <p className="kpi-value">{openRecommendations}</p>
            <p className="kpi-sub">Recommended actions across every zone&apos;s current assessment</p>
          </div>
        </div>

        <h2 className="section-heading">Permits</h2>
        <div className="card executive-section-card">
          <div className="card-grid">
            <div className="card kpi-card">
              <h3>Active</h3>
              <p className="kpi-value">{active.data?.count ?? "—"}</p>
            </div>
            <div className="card kpi-card">
              <h3>Flagged</h3>
              <p className="kpi-value">{flagged.data?.count ?? "—"}</p>
            </div>
            <div className="card kpi-card">
              <h3>Suspend Recommended</h3>
              <p className="kpi-value">{suspendRecommended.data?.count ?? "—"}</p>
            </div>
          </div>
          <p>
            <Link to="/permits">View all permits &rarr;</Link>
          </p>
        </div>

        <h2 className="section-heading">Active Alerts</h2>
        <div className="card executive-section-card">
          {activeAlerts.length === 0 ? (
            <p>No zone is currently above NORMAL.</p>
          ) : (
            <ul className="alert-list">
              {activeAlerts.map((zone) => (
                <li key={zone.zone_id} className={`alert-item alert-${zone.tier}`}>
                  <Link to={`/zones/${zone.zone_id}`}>{zoneLabel(zone.zone_id, zones)}</Link>{" "}
                  <TierBadge tier={zone.tier} /> {zone.compound_risk_score.toFixed(1)}{" "}
                  <span className="kpi-sub">{formatTimestamp(zone.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <h2 className="section-heading">Priority Actions</h2>
        <div className="card">
          {priorityActions.length === 0 ? (
            <p>No recommended actions across the plant right now.</p>
          ) : (
            <ul className="recommendation-list">
              {priorityActions.map((action, index) => (
                <li
                  key={`${action.zoneId}-${action.id}-${index}`}
                  className={`recommendation recommendation-${action.severity}`}
                >
                  <strong>{zoneLabel(action.zoneId, zones)}:</strong> {action.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </QueryResult>
    </section>
  );
}
