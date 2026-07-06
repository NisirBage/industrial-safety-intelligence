import { Link } from "react-router-dom";

import type { RiskAssessment } from "../api/types";
import { DecisionEvolution } from "../components/explainability/DecisionEvolution";
import { ExecutiveStoryPanel } from "../components/explainability/ExecutiveStoryPanel";
import { OperatorTimeline, type TimelineEntry } from "../components/operations/OperatorTimeline";
import { AnimatedCounter } from "../components/presentation/AnimatedCounter";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { useReplay } from "../context/ReplayContext";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue, type PrioritizedAction } from "../lib/actionPlaybook";
import { averageCompoundScore, highestRiskZone, plantReadiness, type ZoneAssessment } from "../lib/executiveKpis";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { agentDisplayName, parseJustification } from "../lib/justification";
import { deriveTimelineEvents } from "../lib/operatorTimeline";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { agentStage, groupRulesByStage } from "../lib/pipelineStages";
import { deriveRecommendations } from "../lib/recommendations";
import { latestTimestamp, worstTier } from "../lib/tier";

const LIVE_HISTORY_LIMIT = 50;

/** M23 Part 5 (Current Incident Stage) - a qualitative label over the
 * top zone's own `tierBefore`/`tierAfter` (already computed and
 * persisted by the frozen Tiering module for this exact tick) - no new
 * risk math, just naming a categorical transition the engine already
 * decided. */
function incidentStage(justification: { tierBefore: string; tierAfter: string } | null): string {
  if (!justification) {
    return "Unknown";
  }
  const { tierBefore, tierAfter } = justification;
  const rank: Record<string, number> = { normal: 0, watch: 1, elevated: 2, critical: 3 };
  if (tierAfter === "normal") {
    return tierBefore === "normal" ? "Monitoring" : "Resolved";
  }
  if (rank[tierAfter] > rank[tierBefore]) {
    return "Escalating";
  }
  if (rank[tierAfter] < rank[tierBefore]) {
    return "De-escalating";
  }
  return "Active Response";
}

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  not_ready: "Not Ready",
};

/** Fixed reporting order for the four agents every assessment carries -
 * matches the order the pipeline itself runs them in, not a ranking. */
const AGENT_ORDER = ["gas_risk", "worker_exposure", "equipment_status", "permit_intelligence"];

/** Same modifier-class table `ActionCard.tsx` uses, kept as an
 * independent copy for the same reason every other small display
 * lookup in this codebase is duplicated rather than shared. */
const IMPACT_CLASS: Record<string, string> = {
  CRITICAL: "impact-critical",
  "VERY HIGH": "impact-very-high",
  HIGH: "impact-high",
  MODERATE: "impact-moderate",
  LOW: "impact-low",
  INFORMATIONAL: "impact-informational",
};

interface ZonePrioritizedAction extends PrioritizedAction {
  zoneId: string;
}

/**
 * M20 Part 1 (Mission Control) - the single-screen "everything a judge
 * or operator needs at a glance" page: Plant Status, Digital Twin (auto-
 * following whichever zone is currently worst), Live Alerts, Decision
 * Contributors for that same worst zone, and the top five Recommended
 * Actions plant-wide. Every section reuses an existing hook/pure-lib
 * function already proven on another page (Executive Overview, Digital
 * Twin, Operations Center) - nothing here computes anything new.
 *
 * M23 Part 2/5 - dual-mode, the same pattern `DigitalTwinPage` and
 * `OperationsCenterPage` already established: when a Time Machine
 * replay is active, every panel below reads that replay's cursor
 * instead of live `/risk/current` polling, so dragging the Time
 * Slider keeps Mission Control synchronized with every other replay-
 * aware page. Zero duplicated replay logic - all of it lives in
 * `ReplayContext`.
 */
export function MissionControlPage() {
  const replay = useReplay();
  const isReplayMode = replay.target !== null;

  const live = useCurrentRisk();
  const { data: zones } = useZones();

  const liveZoneIds = (live.data ?? []).map((assessment) => assessment.zone_id);
  const zoneIds = isReplayMode ? replay.zoneIds : liveZoneIds;

  const entries: { zoneId: string; assessment: RiskAssessment }[] = isReplayMode
    ? zoneIds
        .map((zoneId) => ({ zoneId, assessment: replay.assessmentAt(zoneId) }))
        .filter((entry): entry is { zoneId: string; assessment: RiskAssessment } => entry.assessment !== null)
    : (live.data ?? []).map((assessment) => ({ zoneId: assessment.zone_id, assessment }));
  const zoneAssessments = entries.map((entry) => entry.assessment);

  const isLoading = isReplayMode ? replay.isLoading : live.isLoading;
  const error = isReplayMode ? replay.error : live.error;

  const workerCounts = useZoneWorkerCounts(zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const mapZones: PlantMapZone[] = zoneAssessments.map((assessment, index) => {
    const justification = parseJustification(assessment.justification);
    return {
      zoneId: assessment.zone_id,
      name: zoneLabel(assessment.zone_id, zones),
      tier: assessment.tier,
      compoundRiskScore: assessment.compound_risk_score,
      confidence: assessment.confidence,
      timestamp: assessment.timestamp,
      workerCount: workerCounts[index]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], assessment.zone_id),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
    };
  });

  const zoneEntries: ZoneAssessment[] = zoneAssessments.map((assessment) => ({
    zoneId: assessment.zone_id,
    assessment,
  }));
  const topZone = highestRiskZone(zoneEntries);
  const topJustification = topZone ? parseJustification(topZone.assessment.justification) : null;

  const plantTier = worstTier(zoneAssessments.map((zone) => zone.tier));
  const lastUpdate = latestTimestamp(zoneAssessments.map((zone) => zone.timestamp));
  const avgScore = averageCompoundScore(zoneAssessments);
  const avgConfidence = zoneAssessments.length
    ? zoneAssessments.reduce((sum, zone) => sum + zone.confidence, 0) / zoneAssessments.length
    : 0;
  const readiness = plantReadiness(zoneAssessments);

  /** "Newest first" - the one place on this page that deliberately
   * sorts by time rather than severity, since a live incident feed
   * reads chronologically, not by rank (Executive Overview's own
   * "Active Alerts" already covers the severity-ordered view). */
  const liveAlerts = [...zoneAssessments]
    .filter((zone) => zone.tier !== "normal")
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const agentDecisions = topJustification
    ? AGENT_ORDER.filter((agentName) => agentName in topJustification.agentContributions).map((agentName) => {
        const contribution = topJustification.agentContributions[agentName];
        const stage = agentStage(agentName);
        const stageRules = groupRulesByStage(topJustification.rulesFired).find((entry) => entry.stage === stage);
        return {
          agentName,
          displayName: agentDisplayName(agentName),
          risk: contribution.risk,
          confidence: contribution.confidence,
          rules: stageRules?.rules ?? [],
        };
      })
    : [];

  const SEVERITY_ORDER = ["critical", "high", "medium"] as const;
  const priorityActions: ZonePrioritizedAction[] = zoneAssessments
    .flatMap((zone) => {
      const justification = parseJustification(zone.justification);
      const recommendations = deriveRecommendations(zone.tier, justification);
      return buildActionQueue(recommendations, justification).map((action) => ({
        ...action,
        zoneId: zone.zone_id,
      }));
    })
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .slice(0, 5);

  const stage = incidentStage(topJustification);

  /** M23 Part 5 (Business Impact) - counts over data this page already
   * loads (worker headcounts, active permits, zone tiers). Qualitative
   * and count-based only, per this project's standing rule against
   * fabricated numeric projections - nothing here is a dollar figure
   * or a modeled outcome. */
  const nonNormalZoneIds = new Set(zoneAssessments.filter((z) => z.tier !== "normal").map((z) => z.zone_id));
  const workersInElevatedZones = zoneIds.reduce((sum, zoneId, index) => {
    return nonNormalZoneIds.has(zoneId) ? sum + (workerCounts[index]?.data?.worker_count ?? 0) : sum;
  }, 0);
  const criticalZoneIds = new Set(zoneAssessments.filter((z) => z.tier === "critical").map((z) => z.zone_id));
  const activeCriticalPermits = (activePermits?.items ?? []).filter((permit) =>
    criticalZoneIds.has(permit.zone_id),
  ).length;
  const zonesNeedingResponse = zoneAssessments.filter((z) => z.tier === "elevated" || z.tier === "critical").length;

  const liveTopZoneHistory = useRiskHistory(isReplayMode ? undefined : (topZone?.zoneId ?? undefined), {
    limit: LIVE_HISTORY_LIMIT,
  });
  const timelineEntries: TimelineEntry[] = isReplayMode
    ? replay.bookmarks.filter((b) => b.zone_id === topZone?.zoneId).map((b) => ({ timestamp: b.timestamp, label: b.label, kind: b.kind }))
    : deriveTimelineEvents([...(liveTopZoneHistory.data?.items ?? [])].reverse()).map((e) => ({
        timestamp: e.timestamp,
        label: e.label,
        kind: e.kind,
      }));

  return (
    <section className="mission-control-page">
      <h1>Mission Control</h1>
      <p className="page-intro">
        The whole plant, one screen: current status, the live site plan, incoming alerts, why the
        system is reasoning the way it is, and what to do next.
      </p>

      {isReplayMode && (
        <p className="digital-twin-replay-banner">
          Showing a Time Machine replay tick, not live data.{" "}
          <Link to="/time-machine">Open Time Machine controls &rarr;</Link>
        </p>
      )}

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={zoneAssessments.length === 0}
        emptyLabel={
          isReplayMode
            ? "This replay has no data at the current tick."
            : "No safety assessments have been recorded yet."
        }
        emptyHint={isReplayMode ? undefined : "Mission Control populates as soon as any zone reports a reading - run a scenario to see it live."}
        emptyAction={isReplayMode ? undefined : { label: "Go to Scenario Library", to: "/scenarios" }}
        onRetry={isReplayMode ? undefined : () => live.refetch()}
      >
        <div className={`card kpi-card-primary mission-control-hero plant-readiness-${readiness}`}>
          <h2>Plant Status</h2>
          <div className="mission-control-hero-grid">
            <div>
              <p className="mission-control-hero-label">Operational Status</p>
              <p className="kpi-value">{plantTier ? <TierBadge tier={plantTier} /> : "—"}</p>
            </div>
            <div>
              <p className="mission-control-hero-label">Overall Plant Risk</p>
              <p className="kpi-value">
                <AnimatedCounter value={avgScore} decimals={1} />
              </p>
            </div>
            <div>
              <p className="mission-control-hero-label">Confidence</p>
              <p className="kpi-value">
                <AnimatedCounter value={avgConfidence * 100} decimals={0} suffix="%" />
              </p>
            </div>
            <div>
              <p className="mission-control-hero-label">Readiness</p>
              <p className="kpi-value">{READINESS_LABEL[readiness]}</p>
            </div>
            <div>
              <p className="mission-control-hero-label">Current Incident Stage</p>
              <p className="kpi-value">{topZone ? stage : "—"}</p>
            </div>
          </div>
          <p className="kpi-sub">Last update: {lastUpdate ? formatTimestamp(lastUpdate) : "—"}</p>
        </div>

        <div className="mission-control-grid">
          <div className="card mission-control-panel mission-control-twin">
            <h2 className="section-heading">Digital Twin</h2>
            <PlantMap zones={mapZones} showLegend selectedZoneId={topZone?.zoneId ?? null} />
          </div>

          <div className="card mission-control-panel mission-control-alerts">
            <h2 className="section-heading">Live Alerts</h2>
            {liveAlerts.length === 0 ? (
              <p>No zone is currently above NORMAL.</p>
            ) : (
              <ul className="alert-list mission-control-alert-feed">
                {liveAlerts.map((zone) => (
                  <li key={zone.zone_id} className={`alert-item alert-${zone.tier}`}>
                    <span className="mission-control-alert-icon" aria-hidden="true">
                      {zone.tier === "critical" ? "✖" : zone.tier === "elevated" ? "▲" : "●"}
                    </span>{" "}
                    <Link to={`/zones/${zone.zone_id}`}>{zoneLabel(zone.zone_id, zones)}</Link>{" "}
                    <TierBadge tier={zone.tier} /> {zone.compound_risk_score.toFixed(1)}{" "}
                    <span className="kpi-sub">{formatTimestamp(zone.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card mission-control-panel mission-control-agents">
            <h2 className="section-heading">Decision Contributors</h2>
            {topZone ? (
              <>
                <p className="kpi-sub">
                  Currently explaining: <strong>{zoneLabel(topZone.zoneId, zones)}</strong>
                </p>
                {agentDecisions.length === 0 ? (
                  <p>No decision explanation is available for this zone yet.</p>
                ) : (
                  <ul className="mission-control-agent-list">
                    {agentDecisions.map((agent) => (
                      <li key={agent.agentName} className="mission-control-agent-item">
                        <div className="mission-control-agent-header">
                          <strong>{agent.displayName}</strong>
                          <span className="kpi-sub">
                            Contribution {agent.risk.toFixed(1)} &middot; Confidence{" "}
                            {(agent.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="mission-control-agent-reason">
                          {agent.rules.length > 0
                            ? `Reason: ${agent.rules.join(", ")}`
                            : "Reason: no rule fired for this agent this tick."}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>No active incident to explain right now.</p>
            )}
          </div>

          <div className="card mission-control-panel mission-control-actions">
            <h2 className="section-heading">Recommended Actions</h2>
            {priorityActions.length === 0 ? (
              <p>No recommended actions across the plant right now.</p>
            ) : (
              <ol className="mission-control-action-list">
                {priorityActions.map((action) => (
                  <li
                    key={`${action.zoneId}-${action.id}`}
                    className={`recommendation recommendation-${action.severity}`}
                  >
                    <div className="mission-control-action-header">
                      <strong>{zoneLabel(action.zoneId, zones)}</strong>
                      <span className={`impact-badge ${IMPACT_CLASS[action.impactLevel] ?? ""}`}>
                        {action.impactLevel}
                      </span>
                    </div>
                    <p>{action.text}</p>
                    <p className="kpi-sub">ETA: {action.metadata.eta}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="card mission-control-panel mission-control-timeline">
            <h2 className="section-heading">Live Timeline</h2>
            {topZone ? (
              <OperatorTimeline entries={timelineEntries} />
            ) : (
              <p>No active incident to trace right now.</p>
            )}
          </div>

          <div className="card mission-control-panel mission-control-impact">
            <h2 className="section-heading">Business Impact</h2>
            <ul className="mission-control-impact-list">
              <li>{workersInElevatedZones} worker(s) currently in a zone above NORMAL</li>
              <li>{zonesNeedingResponse} zone(s) requiring active response</li>
              <li>{activeCriticalPermits} active work authorization(s) in a CRITICAL zone</li>
            </ul>
          </div>
        </div>

        {isReplayMode && topZone && (
          <div className="mission-control-grid">
            <DecisionEvolution zoneId={topZone.zoneId} />
            <ExecutiveStoryPanel zoneIds={zoneIds} />
          </div>
        )}
      </QueryResult>
    </section>
  );
}
