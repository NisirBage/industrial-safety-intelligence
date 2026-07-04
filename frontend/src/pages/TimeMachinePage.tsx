import { useState } from "react";
import { Link } from "react-router-dom";

import { AgentContributionChart } from "../components/explainability/AgentContributionChart";
import { PipelineDiagram } from "../components/explainability/PipelineDiagram";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { RootCauseExplorer } from "../components/explainability/RootCauseExplorer";
import { TechnicalView } from "../components/explainability/TechnicalView";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { BookmarksPanel } from "../components/replay/BookmarksPanel";
import { ReplayController } from "../components/replay/ReplayController";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useReplay } from "../context/ReplayContext";
import { useScenarios } from "../hooks/useScenarios";
import { usePermits } from "../hooks/usePermits";
import { useAllZoneSensors } from "../hooks/useScenarioBuilder";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { generateExecutiveExplanation } from "../lib/executiveExplanation";
import { averageCompoundScore, plantReadiness, percentZonesNormal } from "../lib/executiveKpis";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { deriveRecommendations } from "../lib/recommendations";
import { worstTier } from "../lib/tier";

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  not_ready: "Not Ready",
};

function ScenarioPicker() {
  const { data: scenarios, isLoading, error } = useScenarios();
  const replay = useReplay();

  return (
    <QueryResult
      isLoading={isLoading}
      error={error}
      isEmpty={(scenarios ?? []).length === 0}
      emptyLabel="No scenarios in the library yet."
    >
      <div className="card-grid">
        {(scenarios ?? []).map((scenario) => (
          <button
            key={scenario.key}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => replay.startReplay({ scenarioKey: scenario.key })}
          >
            <h3>{scenario.title}</h3>
            <p>{scenario.description}</p>
          </button>
        ))}
      </div>
    </QueryResult>
  );
}

/**
 * Item 7 (Decision Evolution) - every tick up to the replay cursor
 * for one zone, showing each tick's agent contributions and
 * interaction bonus so a viewer can see WHY the tier changed, not
 * just that it did. Every number is the exact persisted
 * `justification` for that tick - nothing is recomputed.
 */
function DecisionEvolution({ zoneId }: { zoneId: string }) {
  const replay = useReplay();
  const { data: zones } = useZones();

  const timeline = replay.zoneTimeline(zoneId);
  const upToCursor = timeline.filter(
    (a) => replay.currentTimestamp !== null && a.timestamp <= replay.currentTimestamp,
  );

  return (
    <div className="card">
      <h3>Decision Evolution - {zoneLabel(zoneId, zones)}</h3>
      {upToCursor.length === 0 ? (
        <p>No ticks yet at this point in the replay.</p>
      ) : (
        <ol className="decision-evolution-list">
          {upToCursor.map((assessment) => {
            const justification = parseJustification(assessment.justification);
            return (
              <li key={assessment.assessment_id} className="decision-evolution-tick">
                <p>
                  <strong>{formatTimestamp(assessment.timestamp)}</strong>{" "}
                  {assessment.compound_risk_score.toFixed(1)}{" "}
                  <TierBadge tier={assessment.tier} />
                </p>
                {justification && (
                  <>
                    <AgentContributionChart contributions={justification.agentContributions} />
                    {justification.interactionBonusApplied > 1 &&
                      justification.rulesFired.includes("interaction_bonus_applied") && (
                        <p className="decision-evolution-bonus">
                          Interaction bonus: ×{justification.interactionBonusApplied.toFixed(2)}
                        </p>
                      )}
                    {justification.tierBefore !== justification.tierAfter && (
                      <p className="decision-evolution-transition">
                        {justification.tierBefore} &rarr; {justification.tierAfter}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Item 1 (Time Machine) - replays every executed scenario tick-by-tick
 * from persisted data only (`GET /replay`), with every existing view
 * (plant map, executive-style KPIs, zone detail, research-mode
 * pipeline, decision evolution, counterfactual) synchronized to one
 * shared cursor (`ReplayContext`). Nothing here recomputes risk - every
 * value is a persisted `RiskAssessment`/bookmark this platform already
 * wrote.
 */
export function TimeMachinePage() {
  const replay = useReplay();
  const { data: zones } = useZones();
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const [showTechnicalView, setShowTechnicalView] = useState(false);

  const workerCounts = useZoneWorkerCounts(replay.zoneIds);
  const zoneSensors = useAllZoneSensors(replay.zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const assessmentsAtCursor = replay.zoneIds
    .map((zoneId) => ({ zoneId, assessment: replay.assessmentAt(zoneId) }))
    .filter((entry): entry is { zoneId: string; assessment: NonNullable<typeof entry.assessment> } =>
      entry.assessment !== null,
    );

  const counterfactuals = useZoneCounterfactuals(
    assessmentsAtCursor.map(({ zoneId, assessment }) => ({ zoneId, timestamp: assessment.timestamp })),
  );

  if (replay.target === null) {
    return (
      <section>
        <h1>Time Machine</h1>
        <p className="page-intro">
          Replay any executed scenario tick-by-tick, entirely from persisted data - pick a
          scenario from the library below to begin.
        </p>
        <ScenarioPicker />
      </section>
    );
  }

  const plantTier = worstTier(assessmentsAtCursor.map(({ assessment }) => assessment.tier));
  const avgScore = averageCompoundScore(assessmentsAtCursor.map(({ assessment }) => assessment));
  const readiness = plantReadiness(assessmentsAtCursor.map(({ assessment }) => assessment));
  const normalPercent = percentZonesNormal(assessmentsAtCursor.map(({ assessment }) => assessment));

  const mapZones: PlantMapZone[] = assessmentsAtCursor.map(({ zoneId, assessment }) => {
    const justification = parseJustification(assessment.justification);
    const workerCountIndex = replay.zoneIds.indexOf(zoneId);
    return {
      zoneId,
      name: zoneLabel(zoneId, zones),
      tier: assessment.tier,
      compoundRiskScore: assessment.compound_risk_score,
      confidence: assessment.confidence,
      timestamp: assessment.timestamp,
      workerCount: workerCounts[workerCountIndex]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zoneId),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
      gasType: zoneSensors[workerCountIndex]?.data?.[0]?.gas_type,
    };
  });

  const displayZoneId = focusedZoneId ?? assessmentsAtCursor[0]?.zoneId ?? null;
  const displayAssessment = assessmentsAtCursor.find((e) => e.zoneId === displayZoneId)?.assessment;
  const displayJustification = displayAssessment ? parseJustification(displayAssessment.justification) : null;
  const displayRecommendations = displayAssessment
    ? deriveRecommendations(displayAssessment.tier, displayJustification)
    : [];
  const displayCounterfactualIndex = assessmentsAtCursor.findIndex((e) => e.zoneId === displayZoneId);
  const displayCounterfactual =
    displayCounterfactualIndex >= 0 ? counterfactuals[displayCounterfactualIndex]?.data : undefined;
  const displayMapZone = mapZones.find((z) => z.zoneId === displayZoneId);
  const displayExplanation = displayAssessment
    ? generateExecutiveExplanation(displayAssessment, displayJustification, displayRecommendations)
    : null;
  const displayZoneBookmarks = replay.bookmarks.filter((b) => b.zone_id === displayZoneId);

  return (
    <section>
      <h1>Time Machine</h1>
      <ReplayController />

      {replay.allTimestamps.length > 0 && (
        <>
          <div className="card twin-summary-strip">
            <span>Plant status: {plantTier ? <TierBadge tier={plantTier} /> : "—"}</span>
            <span>Average compound score: {avgScore.toFixed(1)}</span>
            <span className={`plant-readiness-${readiness}`}>
              Readiness: {READINESS_LABEL[readiness]} ({normalPercent.toFixed(0)}% normal)
            </span>
          </div>

          <div className="time-machine-layout">
            <div>
              <div className="card" style={{ marginBottom: "1rem" }}>
                <PlantMap zones={mapZones} onZoneClick={setFocusedZoneId} />
              </div>

              {displayZoneId && displayAssessment && (
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>{zoneLabel(displayZoneId, zones)}</h3>
                  <p>
                    {displayAssessment.compound_risk_score.toFixed(1)}{" "}
                    <TierBadge tier={displayAssessment.tier} />{" "}
                    <Link to={`/zones/${displayZoneId}`}>Zone detail &rarr;</Link>{" "}
                    <Link to={`/explain/${displayAssessment.assessment_id}`}>Explain &rarr;</Link>{" "}
                    <Link to={`/operations?zone=${displayZoneId}`}>Operations Center &rarr;</Link>
                  </p>

                  {displayExplanation && (
                    <p className="executive-explanation">{displayExplanation}</p>
                  )}

                  <h4>Decision Graph</h4>
                  <PipelineDiagram assessment={displayAssessment} justification={displayJustification} />

                  <h4>Recommendations</h4>
                  <RecommendationList recommendations={displayRecommendations} />
                </div>
              )}

              {displayAssessment && (
                <RootCauseExplorer
                  assessment={displayAssessment}
                  justification={displayJustification}
                  counterfactual={displayCounterfactual}
                  workerCount={displayMapZone?.workerCount}
                  hasActivePermit={(displayMapZone?.activePermitTypes?.length ?? 0) > 0}
                />
              )}

              {displayZoneId && <DecisionEvolution zoneId={displayZoneId} />}

              <div className="card">
                <label className="pipeline-overlay-toggle">
                  <input
                    type="checkbox"
                    checked={showTechnicalView}
                    onChange={(event) => setShowTechnicalView(event.target.checked)}
                  />
                  Show technical view
                </label>
                {showTechnicalView && displayAssessment && (
                  <TechnicalView
                    assessment={displayAssessment}
                    justification={displayJustification}
                    bookmarks={displayZoneBookmarks}
                  />
                )}
              </div>
            </div>

            <div>
              <BookmarksPanel />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
