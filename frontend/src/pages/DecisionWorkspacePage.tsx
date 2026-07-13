import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { MiniSparkline } from "../components/common/MiniSparkline";
import { TierBadge } from "../components/common/TierBadge";
import { AgentContributionChart } from "../components/explainability/AgentContributionChart";
import { DecisionStabilityPanel } from "../components/explainability/DecisionStabilityPanel";
import { OperationalNarrativeTimeline } from "../components/explainability/OperationalNarrativeTimeline";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { RulesFiredList } from "../components/explainability/RulesFiredList";
import { HistoricalIntelligencePanel } from "../components/historical/HistoricalIntelligencePanel";
import { OperationalForesightPanel } from "../components/foresight/OperationalForesightPanel";
import { useForesightForecast } from "../hooks/useForesightForecast";
import { useHistoricalMatches } from "../hooks/useHistoricalMatches";
import { usePermits } from "../hooks/usePermits";
import { useRiskAssessment } from "../hooks/useRiskAssessment";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneEquipment } from "../hooks/useScenarioBuilder";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue } from "../lib/actionPlaybook";
import { standardsForRecommendation } from "../lib/complianceStandards";
import { buildConfidenceBreakdown } from "../lib/confidenceBreakdown";
import {
  clearLocalAcknowledgment,
  getLocalAcknowledgment,
  setLocalAcknowledgment,
} from "../lib/decisionApproval";
import { buildRecommendationStability } from "../lib/decisionStability";
import {
  DEFAULT_WORKSPACE_STAGE,
  isWorkspaceStageId,
  WORKSPACE_STAGES,
  type WorkspaceStageId,
} from "../lib/decisionWorkspace";
import { buildOperationalNarrative } from "../lib/operationalNarrative";
import { exportDecisionReportPdf, type DecisionReportSection } from "../lib/decisionReportPdf";
import { businessStoryLine, generateExecutiveExplanation } from "../lib/executiveExplanation";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";
import { resolveScenarioKey } from "../lib/scenarioResolution";

/**
 * M28 Part 1 (Decision Workspace) - the primary operational screen:
 * one assessment's already-computed facts, reorganized into the
 * sequence an operator actually works through (Situation -> Understand
 * -> Evidence -> Historical Context -> Forecast -> Business Impact ->
 * Available Options -> Recommended Action -> Approval -> Monitoring ->
 * Export). Every stage below renders a hook or component this app
 * already has (ExplainabilityPage, DecisionReportPage,
 * HistoricalIntelligencePanel, OperationalForesightPanel,
 * RecommendationList, actionPlaybook) - nothing here recomputes risk,
 * tier, confidence, a forecast, or a historical match.
 */
export function DecisionWorkspacePage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const stageParam = searchParams.get("stage");
  const activeStage: WorkspaceStageId = isWorkspaceStageId(stageParam)
    ? stageParam
    : DEFAULT_WORKSPACE_STAGE;

  const { data: assessment, isLoading, error, refetch } = useRiskAssessment(assessmentId);
  const { data: zones } = useZones();
  const { data: scenarios } = useScenarios();

  const justification = assessment ? parseJustification(assessment.justification) : null;
  const recommendations = assessment ? deriveRecommendations(assessment.tier, justification) : [];
  const actionQueue = buildActionQueue(recommendations, justification);
  const topAction = actionQueue[0];

  const { data: historicalMatches } = useHistoricalMatches(assessment?.zone_id, assessment?.timestamp);
  const bestMatch = historicalMatches?.matches[0];
  const scenarioKey = resolveScenarioKey(scenarios, assessment?.zone_id, assessment?.timestamp);

  const { data: riskHistory } = useRiskHistory(assessment?.zone_id, { limit: 50 });
  const currentTimeline = [...(riskHistory?.items ?? [])].reverse();

  const { data: foresight } = useForesightForecast(
    assessment?.zone_id,
    assessment?.timestamp,
    scenarioKey,
  );
  const confidenceFactors = assessment
    ? buildConfidenceBreakdown(assessment, justification, bestMatch, foresight)
    : [];
  const stability = buildRecommendationStability(riskHistory?.items ?? [], confidenceFactors);

  const workerCountQueries = useZoneWorkerCounts(assessment ? [assessment.zone_id] : []);
  const workerCount = workerCountQueries[0]?.data;
  const { data: equipment } = useZoneEquipment(assessment?.zone_id);
  const { data: activePermits } = usePermits(
    assessment ? { zone_id: assessment.zone_id, status: "active" } : {},
  );

  const [ackNote, setAckNote] = useState("");
  const acknowledgment = assessment ? getLocalAcknowledgment(assessment.assessment_id) : null;
  const [, forceRerender] = useState(0);

  function setStage(stage: WorkspaceStageId) {
    setSearchParams({ stage });
  }

  function handleAcknowledge() {
    if (!assessment) {
      return;
    }
    setLocalAcknowledgment(assessment.assessment_id, ackNote, new Date().toISOString());
    forceRerender((n) => n + 1);
  }

  function handleUndoAcknowledge() {
    if (!assessment) {
      return;
    }
    clearLocalAcknowledgment(assessment.assessment_id);
    forceRerender((n) => n + 1);
  }

  function handleExportPdf() {
    if (!assessment) {
      return;
    }
    const sections: DecisionReportSection[] = [
      {
        heading: "Situation",
        lines: [
          `Zone: ${zoneLabel(assessment.zone_id, zones)}`,
          `Timestamp: ${formatTimestamp(assessment.timestamp)}`,
          `Tier: ${assessment.tier.toUpperCase()} (${assessment.compound_risk_score.toFixed(1)})`,
          businessStoryLine(assessment, justification),
        ],
      },
      {
        heading: "Understand",
        lines: [generateExecutiveExplanation(assessment, justification, recommendations)],
      },
      {
        heading: "Historical Context",
        lines: bestMatch
          ? [`${bestMatch.incident_name} - similarity ${(bestMatch.similarity * 100).toFixed(0)}%`]
          : ["No similar historical incidents found."],
      },
      {
        heading: "Business Impact",
        lines: bestMatch
          ? [bestMatch.business_impact, bestMatch.operational_impact, bestMatch.safety_impact]
          : ["No comparable historical incident to estimate business impact from."],
      },
      {
        heading: "Recommended Action",
        lines: topAction
          ? [`[${topAction.impactLevel}] ${topAction.text}`, `ETA: ${topAction.metadata.eta}`]
          : ["No recommended action for this assessment."],
      },
      {
        heading: "Approval",
        lines: acknowledgment
          ? [
              `Acknowledged locally at ${formatTimestamp(acknowledgment.acknowledgedAtIso)}`,
              acknowledgment.note || "(no note)",
            ]
          : ["Not yet acknowledged."],
      },
    ];
    exportDecisionReportPdf(
      {
        title: "Decision Workspace Summary",
        subtitle: `${zoneLabel(assessment.zone_id, zones)} - ${formatTimestamp(assessment.timestamp)}`,
        generatedAt: new Date().toISOString(),
        sections,
      },
      `decision-workspace-${assessment.assessment_id}.pdf`,
    );
  }

  return (
    <section className="decision-workspace">
      <p>
        <Link to={`/explain/${assessmentId ?? ""}`}>&larr; Explainability</Link>
      </p>
      <h1>Decision Workspace</h1>
      <p className="page-intro">
        Every stage below is the same data this platform already computes, reorganized into the
        order an operator actually works through it - nothing here is a new reasoning step.
      </p>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!assessment}
        emptyLabel="Assessment not found."
        onRetry={() => refetch()}
      >
        {assessment && (
          <>
            <div className="card decision-workspace-header">
              <strong>{zoneLabel(assessment.zone_id, zones)}</strong> &middot;{" "}
              {formatTimestamp(assessment.timestamp)} &middot; <TierBadge tier={assessment.tier} />{" "}
              {assessment.compound_risk_score.toFixed(1)}
            </div>

            <nav className="decision-workspace-stepper" aria-label="Decision workflow stages">
              {WORKSPACE_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className={`decision-workspace-step${activeStage === stage.id ? " decision-workspace-step-active" : ""}`}
                  onClick={() => setStage(stage.id)}
                  aria-current={activeStage === stage.id ? "step" : undefined}
                >
                  {stage.label}
                </button>
              ))}
            </nav>

            <div className="card decision-workspace-content">
              {activeStage === "situation" && (
                <>
                  <h3>Situation</h3>
                  <p className="decision-workspace-narrative">
                    {businessStoryLine(assessment, justification)}
                  </p>
                  <p className="kpi-sub">
                    {zoneLabel(assessment.zone_id, zones)} is currently at{" "}
                    <TierBadge tier={assessment.tier} /> ({assessment.compound_risk_score.toFixed(1)}
                    ), confidence {(assessment.confidence * 100).toFixed(0)}%.
                  </p>
                </>
              )}

              {activeStage === "understand" && (
                <>
                  <h3>Understand</h3>
                  <p>{generateExecutiveExplanation(assessment, justification, recommendations)}</p>
                  {justification && (
                    <p className="tier-transition">
                      <TierBadge tier={justification.tierBefore} /> &rarr;{" "}
                      <TierBadge tier={justification.tierAfter} />
                    </p>
                  )}
                  <h4>Decision Stability</h4>
                  <DecisionStabilityPanel stability={stability} />
                  <h4>Operational Narrative</h4>
                  <OperationalNarrativeTimeline
                    entries={buildOperationalNarrative(currentTimeline)}
                  />
                </>
              )}

              {activeStage === "evidence" && (
                <>
                  <h3>Evidence</h3>
                  {justification ? (
                    <>
                      <AgentContributionChart
                        contributions={justification.agentContributions}
                        justification={justification}
                      />
                      <h4>Rules fired</h4>
                      <RulesFiredList rules={justification.rulesFired} />
                    </>
                  ) : (
                    <p>No structured justification available for this tick.</p>
                  )}
                </>
              )}

              {activeStage === "historical" && assessment.zone_id && (
                <>
                  <h3>Historical Context</h3>
                  <HistoricalIntelligencePanel
                    zoneId={assessment.zone_id}
                    timestamp={assessment.timestamp}
                    currentTimeline={currentTimeline}
                  />
                  <p>
                    <Link to="/replay-comparison">Compare side by side in Replay Comparison &rarr;</Link>
                  </p>
                </>
              )}

              {activeStage === "forecast" && (
                <>
                  <h3>Forecast</h3>
                  {scenarioKey ? (
                    <OperationalForesightPanel
                      zoneId={assessment.zone_id}
                      timestamp={assessment.timestamp}
                      scenarioKey={scenarioKey}
                      currentTimeline={currentTimeline}
                    />
                  ) : (
                    <p>
                      Forecast requires a cataloged scenario context - not available for this
                      assessment.
                    </p>
                  )}
                </>
              )}

              {activeStage === "business_impact" && (
                <>
                  <h3>Business Impact</h3>
                  {bestMatch ? (
                    <dl className="historical-match-impact">
                      <dt>Business impact</dt>
                      <dd>{bestMatch.business_impact}</dd>
                      <dt>Operational impact</dt>
                      <dd>{bestMatch.operational_impact}</dd>
                      <dt>Safety impact</dt>
                      <dd>{bestMatch.safety_impact}</dd>
                    </dl>
                  ) : (
                    <p>No comparable historical incident to estimate business impact from.</p>
                  )}
                  <h4>Digital Twin snapshot</h4>
                  <p>Workers present: {workerCount?.worker_count ?? "unknown"}</p>
                  <p>Equipment items: {equipment?.length ?? 0}</p>
                  <p>Active work authorizations: {activePermits?.items.length ?? 0}</p>
                </>
              )}

              {activeStage === "options" && (
                <>
                  <h3>Available Options</h3>
                  <RecommendationList recommendations={recommendations} />
                </>
              )}

              {activeStage === "recommended_action" && (
                <>
                  <h3>Recommended Action</h3>
                  {topAction ? (
                    <div className="decision-workspace-top-action">
                      <p className="recommendation-text">{topAction.text}</p>
                      <dl className="decision-workspace-action-meta">
                        <dt>Impact</dt>
                        <dd>{topAction.impactLevel}</dd>
                        <dt>ETA</dt>
                        <dd>{topAction.metadata.eta}</dd>
                        <dt>Required personnel</dt>
                        <dd>{topAction.metadata.requiredPersonnel}</dd>
                        <dt>Required equipment</dt>
                        <dd>{topAction.metadata.requiredEquipment ?? "None"}</dd>
                        {topAction.dependencyLabels.length > 0 && (
                          <>
                            <dt>Depends on</dt>
                            <dd>{topAction.dependencyLabels.join(", ")}</dd>
                          </>
                        )}
                      </dl>
                      {standardsForRecommendation(topAction.id).length > 0 && (
                        <p className="kpi-sub">
                          Aligns with {standardsForRecommendation(topAction.id).length} supporting
                          standard(s) - see Available Options for detail.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p>No recommended action - continue normal operations.</p>
                  )}
                </>
              )}

              {activeStage === "approval" && (
                <>
                  <h3>Approval</h3>
                  <p className="kpi-sub">
                    Acknowledged locally in this browser session only - not written to the
                    persistent audit trail.
                  </p>
                  {acknowledgment ? (
                    <div className="decision-workspace-ack-confirmed">
                      <p>
                        Acknowledged at {formatTimestamp(acknowledgment.acknowledgedAtIso)}
                        {acknowledgment.note && <> &middot; &ldquo;{acknowledgment.note}&rdquo;</>}
                      </p>
                      <button type="button" onClick={handleUndoAcknowledge}>
                        Undo acknowledgment
                      </button>
                    </div>
                  ) : (
                    <div className="decision-workspace-ack-form">
                      <label htmlFor="ack-note">Note (optional)</label>
                      <textarea
                        id="ack-note"
                        value={ackNote}
                        onChange={(event) => setAckNote(event.target.value)}
                        rows={3}
                      />
                      <button type="button" onClick={handleAcknowledge}>
                        Mark as reviewed
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeStage === "monitoring" && (
                <>
                  <h3>Monitoring</h3>
                  {currentTimeline.length > 1 ? (
                    <MiniSparkline
                      values={currentTimeline.map((item) => item.compound_risk_score)}
                    />
                  ) : (
                    <p>Not enough history yet to show a trend.</p>
                  )}
                  <p>
                    <Link to={`/zones/${assessment.zone_id}`}>Open live Zone page &rarr;</Link>{" "}
                    &middot; <Link to="/time-machine">Open Time Machine &rarr;</Link>
                  </p>
                </>
              )}

              {activeStage === "export" && (
                <>
                  <h3>Export</h3>
                  <button type="button" onClick={handleExportPdf}>
                    Export Decision Workspace Summary (PDF)
                  </button>
                  <p>
                    <Link to={`/decision-report/${assessment.assessment_id}`}>
                      Open full Decision Report &rarr;
                    </Link>
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </QueryResult>
    </section>
  );
}
