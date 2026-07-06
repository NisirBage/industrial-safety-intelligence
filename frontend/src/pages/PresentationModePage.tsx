import { useEffect, useMemo, useRef, useState } from "react";

import { PresentationHud } from "../components/presentation/PresentationHud";
import { Scene1Title, Scene2DigitalTwin, Scene3Incident } from "../components/presentation/ScenesIntro";
import { Scene4MultiAgentReasoning } from "../components/presentation/ScenesEngine";
import { Scene7Executive, Scene8Counterfactual, Scene10Closing } from "../components/presentation/ScenesClosing";
import {
  Scene7MissionControl,
  Scene8FinalRecommendation,
  Scene9BusinessImpact,
} from "../components/presentation/ScenesMissionControl";
import { TalkingPointsPanel } from "../components/presentation/TalkingPointsPanel";
import { DemoReadinessPanel } from "../components/presentation/DemoReadinessPanel";
import type { PlantMapZone } from "../components/plant/PlantMap";
import { useReplay } from "../context/ReplayContext";
import { usePresentationMode } from "../context/PresentationModeContext";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useAllZoneSensors } from "../hooks/useScenarioBuilder";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue } from "../lib/actionPlaybook";
import { averageCompoundScore, plantReadiness, percentZonesNormal } from "../lib/executiveKpis";
import { zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import {
  elapsedBeforeScene,
  findFirstEscalationIndex,
  findPeakIndex,
  PRESENTATION_SCENES,
  remainingAfterScene,
  SCENE_TALKING_POINTS,
  selectPresentationScenario,
  TOTAL_PRESENTATION_DURATION_MS,
} from "../lib/presentationScript";
import { deriveRecommendations } from "../lib/recommendations";
import { worstTier } from "../lib/tier";

const TICK_MS = 250;
/** mm:ss for the speaker timer - never a business metric, purely a
 * display format over this page's own elapsed/remaining milliseconds. */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
/** Scene keys whose entire point is to hold on the replay's single
 * most dramatic real tick - the peak compound score - rather than
 * the first moment of escalation Scene 3 anchors on. */
const PEAK_TICK_SCENES = new Set([
  "multi-agent-reasoning",
  "counterfactual",
  "executive-dashboard",
  "mission-control",
  "final-recommendation",
]);

/**
 * Part 1/2 (Presentation Mode) - a guided, auto-advancing tour of the
 * whole platform for live hackathon judging. Every scene mounts a
 * component this platform already built, reading data already
 * exposed by existing endpoints - nothing here computes a new risk
 * value, and no `src/domain/` file changes for this milestone.
 * Scenes 3 onward drive the same shared `ReplayContext` the Time
 * Machine uses (via `jumpToTimestamp`, never a second replay state),
 * so leaving this page mid-tour and opening Time Machine/Digital
 * Twin/Operations Center shows the exact same moment.
 */
export function PresentationModePage() {
  const replay = useReplay();
  const presentationMode = usePresentationMode();
  const { data: zones } = useZones();
  const { data: currentRisk } = useCurrentRisk();
  const { data: scenarios } = useScenarios();
  const { data: activePermits } = usePermits({ status: "active" });

  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [elapsedInScene, setElapsedInScene] = useState(0);
  const elapsedRef = useRef(0);

  const scene = PRESENTATION_SCENES[sceneIndex];

  // --- Live plant snapshot (Scene 1/2) ---
  const liveZoneIds = useMemo(() => (currentRisk ?? []).map((a) => a.zone_id), [currentRisk]);
  const liveWorkerCounts = useZoneWorkerCounts(liveZoneIds);
  const liveZoneSensors = useAllZoneSensors(liveZoneIds);
  const plantStatus = worstTier((currentRisk ?? []).map((a) => a.tier));
  const zoneCount = zones?.length ?? 0;
  const activePermitCount = activePermits?.count ?? 0;

  const mapZones: PlantMapZone[] = (currentRisk ?? []).map((assessment, index) => {
    const justification = parseJustification(assessment.justification);
    return {
      zoneId: assessment.zone_id,
      name: zoneLabel(assessment.zone_id, zones),
      tier: assessment.tier,
      compoundRiskScore: assessment.compound_risk_score,
      confidence: assessment.confidence,
      timestamp: assessment.timestamp,
      workerCount: liveWorkerCounts[index]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], assessment.zone_id),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
      gasType: liveZoneSensors[index]?.data?.[0]?.gas_type,
    };
  });

  // --- Replay-driven story (Scenes 3-9) ---
  const focusZoneId = replay.zoneIds[0] ?? null;
  const focusTimeline = focusZoneId ? replay.zoneTimeline(focusZoneId) : [];
  const focusAssessment = focusZoneId ? (replay.assessmentAt(focusZoneId) ?? undefined) : undefined;
  const focusJustification = focusAssessment ? parseJustification(focusAssessment.justification) : null;
  const focusRecommendations = focusAssessment
    ? deriveRecommendations(focusAssessment.tier, focusJustification)
    : [];
  const focusActionQueue = buildActionQueue(focusRecommendations, focusJustification);
  const focusCounterfactuals = useZoneCounterfactuals(
    focusZoneId && focusAssessment ? [{ zoneId: focusZoneId, timestamp: focusAssessment.timestamp }] : [],
  );
  const focusCounterfactual = focusCounterfactuals[0]?.data;

  // --- Plant-wide executive snapshot at the replay cursor (Executive Dashboard scene) ---
  const cursorAssessments = replay.zoneIds
    .map((zoneId) => replay.assessmentAt(zoneId))
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const avgScore = averageCompoundScore(cursorAssessments);
  const readiness = plantReadiness(cursorAssessments);
  const normalPercent = percentZonesNormal(cursorAssessments);

  // --- Mission Control scene: the same replay cursor, shaped as PlantMapZone[] ---
  const cursorMapZones: PlantMapZone[] = replay.zoneIds
    .map((zoneId) => {
      const assessment = replay.assessmentAt(zoneId);
      if (!assessment) {
        return null;
      }
      const justification = parseJustification(assessment.justification);
      const zone: PlantMapZone = {
        zoneId,
        name: zoneLabel(zoneId, zones),
        tier: assessment.tier,
        compoundRiskScore: assessment.compound_risk_score,
        confidence: assessment.confidence,
        timestamp: assessment.timestamp,
        equipmentRisk: justification?.agentContributions.equipment_status?.risk,
        gasRisk: justification?.agentContributions.gas_risk?.risk,
      };
      return zone;
    })
    .filter((zone): zone is PlantMapZone => zone !== null);

  // --- Business Impact scene: real durations/checks, never fabricated ---
  const escalationTimestamp = focusTimeline[findFirstEscalationIndex(focusTimeline)]?.timestamp;
  const peakTimestamp = focusTimeline[findPeakIndex(focusTimeline)]?.timestamp;
  const leadTimeMinutes =
    escalationTimestamp && peakTimestamp
      ? (new Date(peakTimestamp).getTime() - new Date(escalationTimestamp).getTime()) / 60000
      : null;
  const missedByLegacyBaseline =
    focusCounterfactual && focusAssessment
      ? focusAssessment.tier !== "normal" && !focusCounterfactual.counterfactual.alert
      : null;
  const businessValueBullets = [
    SCENE_TALKING_POINTS["multi-agent-reasoning"].businessValue,
    SCENE_TALKING_POINTS.counterfactual.businessValue,
    SCENE_TALKING_POINTS["mission-control"].businessValue,
  ];

  // --- Scene timer: auto-advance ---
  useEffect(() => {
    elapsedRef.current = 0;
    setElapsedInScene(0);
  }, [sceneIndex]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      elapsedRef.current += TICK_MS;
      setElapsedInScene(elapsedRef.current);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const remaining = Math.max(0, scene.durationMs - elapsedRef.current);
    const timeout = window.setTimeout(() => {
      if (sceneIndex >= PRESENTATION_SCENES.length - 1) {
        setPlaying(false);
      } else {
        setSceneIndex((i) => i + 1);
      }
    }, remaining);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, sceneIndex]);

  // --- Scene-driven replay scrubbing ---
  useEffect(() => {
    if (!started || replay.target === null) {
      return;
    }
    if (scene.key === "incident-begins" && focusTimeline.length > 0) {
      replay.jumpToTimestamp(focusTimeline[findFirstEscalationIndex(focusTimeline)].timestamp);
    } else if (PEAK_TICK_SCENES.has(scene.key) && focusTimeline.length > 0) {
      replay.jumpToTimestamp(focusTimeline[findPeakIndex(focusTimeline)].timestamp);
    }
    if (replay.playing) {
      replay.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.key, started, focusZoneId, focusTimeline.length]);

  // --- HUD toggle (Part 4) ---
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "d" || event.key === "D") {
        setHudVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- M20 Part 3 (Guided Presentation) - keyboard navigation while the
  // tour is running: Left/Right step scenes, Space toggles auto-play,
  // Esc exits back to the launcher. ---
  useEffect(() => {
    if (!started) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSceneIndex((i) => Math.min(PRESENTATION_SCENES.length - 1, i + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSceneIndex((i) => Math.max(0, i - 1));
      } else if (event.key === " ") {
        event.preventDefault();
        setPlaying((v) => !v);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setPlaying(false);
        setStarted(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started]);

  function handleStart() {
    if (!started && scenarios && scenarios.length > 0 && replay.target === null) {
      const picked = selectPresentationScenario(scenarios);
      if (picked) {
        replay.startReplay({ scenarioKey: picked.key });
      }
    }
    setStarted(true);
    setSceneIndex(0);
    setPlaying(true);
  }

  function handleRestart() {
    replay.reset();
    setSceneIndex(0);
    setPlaying(true);
  }

  /** Part 7 (Judge Mode) - reuses the pre-existing full-screen,
   * chrome-hiding `PresentationModeContext` (distinct from this
   * page's own scene-tour state) rather than building a second
   * "distraction-free" mechanism. */
  function handleToggleJudgeMode() {
    if (judgeMode) {
      presentationMode.exit();
    } else {
      presentationMode.enter();
    }
    setJudgeMode((v) => !v);
  }

  const totalElapsed = elapsedBeforeScene(sceneIndex) + elapsedInScene;
  const remainingMs = Math.max(0, scene.durationMs - elapsedInScene) + remainingAfterScene(sceneIndex);
  const progressPercent = Math.min(100, (totalElapsed / TOTAL_PRESENTATION_DURATION_MS) * 100);

  return (
    <section className="presentation-mode-page">
      <h1>Presentation Mode</h1>

      {!started ? (
        <div className="card presentation-mode-launcher">
          <p>
            A guided, 10-slide tour of this platform - Introduction, Plant Overview, Incident Begins,
            Multi-Agent Reasoning, Counterfactual, Executive Dashboard, Mission Control, Final
            Recommendation, Business Impact, and Closing - in about 90 seconds. No manual clicking
            required. Once started, use Left/Right to step, Space to play/pause, and Esc to exit.
          </p>
          <DemoReadinessPanel scenarios={scenarios} currentRisk={currentRisk} />
          <button type="button" className="presentation-mode-start-button" onClick={handleStart}>
            &#9654; Start Demo
          </button>
        </div>
      ) : (
        <>
          <div className="presentation-mode-controls">
            <button type="button" onClick={() => setSceneIndex((i) => Math.max(0, i - 1))} disabled={sceneIndex === 0}>
              &#9198; Previous
            </button>
            {playing ? (
              <button type="button" onClick={() => setPlaying(false)}>
                &#9208; Pause
              </button>
            ) : (
              <button type="button" onClick={() => setPlaying(true)}>
                &#9654; Auto Play
              </button>
            )}
            <button
              type="button"
              onClick={() => setSceneIndex((i) => Math.min(PRESENTATION_SCENES.length - 1, i + 1))}
              disabled={sceneIndex === PRESENTATION_SCENES.length - 1}
            >
              &#9197; Next
            </button>
            <button type="button" onClick={handleRestart}>
              Restart
            </button>
            <button
              type="button"
              className={judgeMode ? "judge-mode-toggle judge-mode-toggle-active" : "judge-mode-toggle"}
              onClick={handleToggleJudgeMode}
            >
              {judgeMode ? "Exit Judge Mode" : "Judge Mode"}
            </button>
            {!judgeMode && (
              <button type="button" onClick={() => setNotesVisible((v) => !v)}>
                {notesVisible ? "Hide Notes" : "Notes"}
              </button>
            )}
          </div>

          {judgeMode && (
            <div className="judge-mode-banner">
              <span>
                Judge Mode - distraction-free, with Presenter Notes / Judge Takeaway / Technical Detail /
                Business Value for the current scene.
              </span>
              <span className="roadmap-chip" title="Not implemented - disclosed as a future integration, not a built feature.">
                Weather Integration (Roadmap)
              </span>
            </div>
          )}

          <div className="presentation-mode-progress-bar">
            <div className="presentation-mode-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="presentation-mode-progress-label">
            Slide {sceneIndex + 1} of {PRESENTATION_SCENES.length} &middot; {scene.title}
          </p>
          <p className="presentation-mode-speaker-timer">
            {formatClock(totalElapsed)} elapsed &middot; {formatClock(remainingMs)} remaining
          </p>

          <div className="presentation-mode-stage">
            {scene.key === "introduction" && (
              <Scene1Title plantStatus={plantStatus} zoneCount={zoneCount} activePermitCount={activePermitCount} />
            )}
            {scene.key === "plant-overview" && <Scene2DigitalTwin mapZones={mapZones} />}
            {scene.key === "incident-begins" && <Scene3Incident assessment={focusAssessment} zones={zones} />}
            {scene.key === "multi-agent-reasoning" && (
              <Scene4MultiAgentReasoning
                assessment={focusAssessment}
                justification={focusJustification}
                zoneId={focusZoneId}
              />
            )}
            {scene.key === "counterfactual" && (
              <Scene8Counterfactual counterfactual={focusCounterfactual} justification={focusJustification} />
            )}
            {scene.key === "executive-dashboard" && (
              <Scene7Executive
                avgScore={avgScore}
                readiness={readiness}
                normalPercent={normalPercent}
                assessment={focusAssessment}
                justification={focusJustification}
                recommendations={focusRecommendations}
              />
            )}
            {scene.key === "mission-control" && (
              <Scene7MissionControl
                mapZones={cursorMapZones}
                focusZoneId={focusZoneId}
                zones={zones}
                cursorAssessments={cursorAssessments}
                justification={focusJustification}
                topActions={focusActionQueue}
              />
            )}
            {scene.key === "final-recommendation" && (
              <Scene8FinalRecommendation
                topActions={focusActionQueue}
                zoneName={focusZoneId ? zoneLabel(focusZoneId, zones) : "—"}
              />
            )}
            {scene.key === "business-impact" && (
              <Scene9BusinessImpact
                leadTimeMinutes={leadTimeMinutes}
                missedByLegacyBaseline={missedByLegacyBaseline}
                businessValueBullets={businessValueBullets}
              />
            )}
            {scene.key === "closing" && <Scene10Closing />}
          </div>

          {(judgeMode || notesVisible) && <TalkingPointsPanel points={SCENE_TALKING_POINTS[scene.key]} />}
        </>
      )}

      <PresentationHud
        visible={hudVisible}
        sceneTitle={scene.title}
        sceneIndex={sceneIndex}
        sceneCount={PRESENTATION_SCENES.length}
        elapsedMs={totalElapsed}
        remainingMs={remainingMs}
        replayTick={replay.target ? replay.currentIndex : null}
        replayTickCount={replay.target ? replay.allTimestamps.length : null}
        replayTimestamp={replay.currentTimestamp}
        currentZoneName={focusZoneId ? zoneLabel(focusZoneId, zones) : null}
      />
    </section>
  );
}
