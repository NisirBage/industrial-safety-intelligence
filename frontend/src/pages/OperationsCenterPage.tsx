import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { RiskAssessment } from "../api/types";
import { PipelineDiagram } from "../components/explainability/PipelineDiagram";
import { ActionQueue } from "../components/operations/ActionQueue";
import { OperationalDependencyGraph } from "../components/operations/OperationalDependencyGraph";
import { OperationalImpactExplorer } from "../components/operations/OperationalImpactExplorer";
import { OperatorTimeline, type TimelineEntry } from "../components/operations/OperatorTimeline";
import { SopPanel } from "../components/operations/SopPanel";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { ZoneInspectorDrawer } from "../components/plant/ZoneInspectorDrawer";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useReplay } from "../context/ReplayContext";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useAllZoneSensors, useZoneEquipment } from "../hooks/useScenarioBuilder";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue } from "../lib/actionPlaybook";
import { generateExecutiveExplanation } from "../lib/executiveExplanation";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone, formatPermitType } from "../lib/permitIcons";
import { deriveTimelineEvents } from "../lib/operatorTimeline";
import { deriveRecommendations } from "../lib/recommendations";

const LIVE_HISTORY_LIMIT = 50;

/** Which Decision Graph stage each `targetedFactor` value corresponds
 * to, purely for the read-only cross-reference list under the
 * embedded Decision Graph (IOC.9) - never used to drive
 * `PipelineDiagram` itself, which remains fully self-contained. */
function stageLabelFor(targetedFactor: string): string {
  if (targetedFactor === "interaction_bonus") return "Fusion";
  if (targetedFactor === "tier") return "Tiering";
  return targetedFactor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Intelligent Incident Response & Operations Center - "what should
 * the operator do right now?" One page composing the Action Queue,
 * Operational Dependency Graph, Operational Impact Explorer, SOP
 * Integration, Operator Timeline, and embedded Digital Twin/Decision
 * Graph snapshots, all over data every other page on this platform
 * already fetches. Nothing here computes a new risk value - every
 * number is a persisted `RiskAssessment`/`justification` field, and
 * every "impact level" is a qualitative categorical label
 * (lib/actionPlaybook.ts::computeImpactLevel), never a projected
 * compound-risk number.
 *
 * Dual-mode exactly like `TimeMachinePage`/`DigitalTwinPage`: replay-
 * cursor data when a Time Machine replay is active, live
 * `/risk/current` data otherwise - both read the one shared
 * `ReplayContext`, so scrubbing/playing/jumping the Time Machine
 * updates this page too, with no duplicated replay state.
 */
export function OperationsCenterPage() {
  const replay = useReplay();
  const isReplayMode = replay.target !== null;

  const live = useCurrentRisk();
  const { data: zones } = useZones();
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedZoneId, setFocusedZoneIdState] = useState<string | null>(searchParams.get("zone"));

  const setFocusedZoneId = (zoneId: string | null) => {
    setFocusedZoneIdState(zoneId);
    setSearchParams(zoneId ? { zone: zoneId } : {}, { replace: true });
  };

  const liveZoneIds = useMemo(() => (live.data ?? []).map((assessment) => assessment.zone_id), [live.data]);
  const zoneIds = isReplayMode ? replay.zoneIds : liveZoneIds;

  const workerCounts = useZoneWorkerCounts(zoneIds);
  const zoneSensors = useAllZoneSensors(zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const entries: { zoneId: string; assessment: RiskAssessment }[] = isReplayMode
    ? zoneIds
        .map((zoneId) => ({ zoneId, assessment: replay.assessmentAt(zoneId) }))
        .filter((entry): entry is { zoneId: string; assessment: RiskAssessment } => entry.assessment !== null)
    : (live.data ?? []).map((assessment) => ({ zoneId: assessment.zone_id, assessment }));

  const mapZones: PlantMapZone[] = entries.map(({ zoneId, assessment }, index) => {
    const justification = parseJustification(assessment.justification);
    return {
      zoneId,
      name: zoneLabel(zoneId, zones),
      tier: assessment.tier,
      compoundRiskScore: assessment.compound_risk_score,
      confidence: assessment.confidence,
      timestamp: assessment.timestamp,
      workerCount: workerCounts[index]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zoneId),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
      gasType: zoneSensors[index]?.data?.[0]?.gas_type,
    };
  });

  const displayZoneId = focusedZoneId ?? entries[0]?.zoneId ?? null;
  const displayEntry = entries.find((e) => e.zoneId === displayZoneId);
  const displayAssessment = displayEntry?.assessment;
  const displayJustification = displayAssessment ? parseJustification(displayAssessment.justification) : null;
  const displayMapZone = mapZones.find((z) => z.zoneId === displayZoneId);
  const displayRecommendations = displayAssessment
    ? deriveRecommendations(displayAssessment.tier, displayJustification)
    : [];
  const displayQueue = buildActionQueue(displayRecommendations, displayJustification);
  const displayActivePermitTypes = displayMapZone?.activePermitTypes ?? [];

  const { data: displayEquipment } = useZoneEquipment(displayZoneId ?? undefined);

  const counterfactuals = useZoneCounterfactuals(
    entries.map(({ zoneId, assessment }) => ({ zoneId, timestamp: assessment.timestamp })),
  );
  const displayCounterfactualIndex = entries.findIndex((e) => e.zoneId === displayZoneId);
  const displayCounterfactual =
    displayCounterfactualIndex >= 0 ? counterfactuals[displayCounterfactualIndex]?.data : undefined;

  const displayExplanation = displayAssessment
    ? generateExecutiveExplanation(displayAssessment, displayJustification, displayRecommendations)
    : null;

  // Operator Timeline (IOC.6) - replay mode reuses the Time Machine's
  // own persisted bookmarks; live mode derives a lighter equivalent
  // client-side (lib/operatorTimeline.ts), since there is no
  // `/replay`-style window for "right now".
  const liveHistory = useRiskHistory(
    isReplayMode ? undefined : (displayZoneId ?? undefined),
    { limit: LIVE_HISTORY_LIMIT },
  );
  const timelineEntries: TimelineEntry[] = isReplayMode
    ? replay.bookmarks
        .filter((b) => b.zone_id === displayZoneId)
        .map((b) => ({ timestamp: b.timestamp, label: b.label, kind: b.kind }))
    : deriveTimelineEvents([...(liveHistory.data?.items ?? [])].reverse()).map((e) => ({
        timestamp: e.timestamp,
        label: e.label,
        kind: e.kind,
      }));

  const isLoading = isReplayMode ? replay.isLoading : live.isLoading;
  const error = isReplayMode ? replay.error : live.error;

  return (
    <section>
      <h1>Operations Center</h1>
      <p className="page-intro">
        What should the operator do right now? Every action, dependency, and SOP reference below is
        composed from data already computed elsewhere on this platform - nothing here recomputes risk.
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
        isEmpty={entries.length === 0}
        emptyLabel={
          isReplayMode
            ? "This replay has no data at the current tick."
            : "No risk assessments have been recorded yet."
        }
      >
        {displayAssessment && (
          <>
            <div className="card operations-status-header">
              <h2>{zoneLabel(displayZoneId as string, zones)}</h2>
              <p className="operations-status-line">
                <TierBadge tier={displayAssessment.tier} /> {displayAssessment.compound_risk_score.toFixed(1)}{" "}
                &middot; {(displayAssessment.confidence * 100).toFixed(0)}% confidence
                {displayJustification && displayJustification.rulesFired.includes("interaction_bonus_applied") && (
                  <> &middot; Interaction bonus ×{displayJustification.interactionBonusApplied.toFixed(2)}</>
                )}
              </p>
              <p className="operations-status-line">
                Workers present: {displayMapZone?.workerCount ?? "Unknown"} &middot; Active permits:{" "}
                {displayActivePermitTypes.length > 0
                  ? displayActivePermitTypes.map(formatPermitType).join(", ")
                  : "None"}{" "}
                &middot; Equipment:{" "}
                {displayEquipment && displayEquipment.length > 0
                  ? displayEquipment.map((e) => `${e.equipment_type} (${e.isolation_status})`).join(", ")
                  : "None recorded"}
              </p>
              <p className="operations-status-line">
                {isReplayMode ? "Replay tick" : "As of"}: {formatTimestamp(displayAssessment.timestamp)}
              </p>
              {displayExplanation && <p className="executive-explanation">{displayExplanation}</p>}
            </div>

            <div className="operations-layout">
              <div>
                <div className="card">
                  <h3>Prioritized Action Queue</h3>
                  <ActionQueue
                    actions={displayQueue}
                    zoneId={displayZoneId as string}
                    zoneName={zoneLabel(displayZoneId as string, zones)}
                    assessment={displayAssessment}
                    justification={displayJustification}
                    counterfactual={displayCounterfactual}
                    workerCount={displayMapZone?.workerCount}
                    activePermitTypes={displayActivePermitTypes}
                    equipment={displayEquipment}
                    onFocusZone={setFocusedZoneId}
                  />
                </div>

                <div className="card">
                  <h3>Operational Dependency Graph</h3>
                  <OperationalDependencyGraph actions={displayQueue} />
                </div>

                <div className="card">
                  <h3>Operational Impact Explorer</h3>
                  <OperationalImpactExplorer actions={displayQueue} justification={displayJustification} />
                </div>

                <div className="card">
                  <h3>SOP Integration</h3>
                  <SopPanel actions={displayQueue} activePermitTypes={displayActivePermitTypes} />
                </div>

                <div className="card">
                  <h3>Operator Timeline</h3>
                  <OperatorTimeline
                    entries={timelineEntries}
                    onJump={isReplayMode ? replay.jumpToTimestamp : undefined}
                  />
                </div>

                <div className="card">
                  <h3>Decision Graph</h3>
                  <PipelineDiagram assessment={displayAssessment} justification={displayJustification} />
                  {displayQueue.length > 0 && (
                    <div className="operations-node-crossref">
                      <h4>Actions by pipeline stage</h4>
                      <ul>
                        {displayQueue.map((action) => (
                          <li key={action.id}>
                            {stageLabelFor(action.metadata.targetedFactor)}: {action.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="card">
                  <h3>Digital Twin Snapshot</h3>
                  <PlantMap zones={mapZones} onZoneClick={setFocusedZoneId} showLegend />
                  <p>
                    <Link to={`/digital-twin?zone=${displayZoneId}`}>Open full Digital Twin &rarr;</Link>
                  </p>
                </div>

                {displayZoneId && (
                  <ZoneInspectorDrawer
                    zoneId={displayZoneId}
                    name={zoneLabel(displayZoneId, zones)}
                    tier={displayAssessment.tier}
                    compoundRiskScore={displayAssessment.compound_risk_score}
                    confidence={displayAssessment.confidence}
                    timestamp={displayAssessment.timestamp}
                    isReplaySnapshot={isReplayMode}
                    onClose={() => undefined}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </QueryResult>
    </section>
  );
}
