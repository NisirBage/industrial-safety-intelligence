import { useEffect, useRef, useState } from "react";

import { DecisionEvolution } from "../components/explainability/DecisionEvolution";
import { ExecutiveStoryPanel } from "../components/explainability/ExecutiveStoryPanel";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { ReplayController } from "../components/replay/ReplayController";
import { useReplay } from "../context/ReplayContext";
import { usePermits } from "../hooks/usePermits";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { averageCompoundScore, plantReadiness } from "../lib/executiveKpis";
import { zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { worstTier } from "../lib/tier";

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  not_ready: "Not Ready",
};

/**
 * M23 Part 4 (Challenge Mode) - "can the engine respond correctly?"
 * One click picks a random scenario from the existing library
 * (`useScenarios`), starts a real replay (`ReplayContext.startReplay`),
 * and lets it play itself (`ReplayContext.play` - the same auto-
 * advance timer Time Machine's own play button already drives).
 * Every panel below - the plant map, the Decision Evolution for the
 * worst zone, the Executive Story narration - is the exact component
 * Time Machine/Executive Overview already use; nothing here is a new
 * scenario, a new simulation, or a new explanation engine.
 */
export function ChallengeModePage() {
  const replay = useReplay();
  const { data: scenarios, isLoading, error } = useScenarios();
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const [awaitingAutoPlay, setAwaitingAutoPlay] = useState(false);
  const autoPlayedRef = useRef(false);

  const workerCounts = useZoneWorkerCounts(replay.zoneIds);
  const { data: zones } = useZones();
  const { data: activePermits } = usePermits({ status: "active" });

  function startChallenge() {
    const list = scenarios ?? [];
    if (list.length === 0) {
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    autoPlayedRef.current = false;
    setAwaitingAutoPlay(true);
    setFocusedZoneId(null);
    replay.startReplay({ scenarioKey: pick.key });
  }

  // Once the just-started replay's real history has loaded, let it
  // play itself - the exact same `play()` Time Machine's own play
  // button already drives, just triggered automatically here instead
  // of by hand, per this mode's "runs the replay automatically" brief.
  useEffect(() => {
    if (awaitingAutoPlay && !autoPlayedRef.current && replay.allTimestamps.length > 0) {
      replay.play();
      autoPlayedRef.current = true;
      setAwaitingAutoPlay(false);
    }
  }, [awaitingAutoPlay, replay]);

  const assessmentsAtCursor = replay.zoneIds
    .map((zoneId) => ({ zoneId, assessment: replay.assessmentAt(zoneId) }))
    .filter((entry): entry is { zoneId: string; assessment: NonNullable<typeof entry.assessment> } =>
      entry.assessment !== null,
    );

  const plantTier = worstTier(assessmentsAtCursor.map(({ assessment }) => assessment.tier));
  const avgScore = averageCompoundScore(assessmentsAtCursor.map(({ assessment }) => assessment));
  const readiness = plantReadiness(assessmentsAtCursor.map(({ assessment }) => assessment));

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
    };
  });

  const worstZoneId = [...assessmentsAtCursor].sort(
    (a, b) => b.assessment.compound_risk_score - a.assessment.compound_risk_score,
  )[0]?.zoneId;
  const displayZoneId = focusedZoneId ?? worstZoneId ?? null;

  if (replay.target === null) {
    return (
      <section>
        <h1>Challenge Mode</h1>
        <p className="page-intro">Can the engine respond correctly? Pick a scenario at random and watch it play out, fully explained, with no manual clicking.</p>
        <QueryResult isLoading={isLoading} error={error} isEmpty={(scenarios ?? []).length === 0} emptyLabel="No scenarios in the library yet.">
          <button type="button" className="start-demo-button" onClick={startChallenge}>
            Start Challenge
          </button>
        </QueryResult>
      </section>
    );
  }

  return (
    <section>
      <h1>Challenge Mode</h1>
      <p className="page-intro">Can the engine respond correctly? Watching it happen, live.</p>
      <button type="button" className="start-demo-button" onClick={startChallenge}>
        New Random Scenario
      </button>

      <ReplayController />

      {replay.allTimestamps.length > 0 && (
        <>
          <div className="card twin-summary-strip">
            <span>Plant status: {plantTier ? <TierBadge tier={plantTier} /> : "—"}</span>
            <span>Average plant risk: {avgScore.toFixed(1)}</span>
            <span className={`plant-readiness-${readiness}`}>Readiness: {READINESS_LABEL[readiness]}</span>
          </div>

          <div className="time-machine-layout">
            <div>
              <div className="card" style={{ marginBottom: "1rem" }}>
                <PlantMap zones={mapZones} onZoneClick={setFocusedZoneId} selectedZoneId={displayZoneId} showLegend />
              </div>

              {displayZoneId && <DecisionEvolution zoneId={displayZoneId} />}
            </div>

            <div>
              <ExecutiveStoryPanel zoneIds={replay.zoneIds} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
