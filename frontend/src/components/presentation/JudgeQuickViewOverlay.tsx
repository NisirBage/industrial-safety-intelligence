import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { JUDGE_QUICK_VIEW_TALKING_POINTS, useJudgeQuickView } from "../../context/JudgeQuickViewContext";
import { usePresentationMode } from "../../context/PresentationModeContext";
import { useReplay } from "../../context/ReplayContext";
import { TalkingPointsPanel } from "./TalkingPointsPanel";

interface LaunchStep {
  label: string;
  done: boolean;
}

/**
 * M21 Part 1 (Demo Launcher) - the launch-sequence checklist Judge
 * Quick View's `activate()` already performs, rendered from the same
 * real state `ReplayContext`/`PresentationModeContext` already carry -
 * never a timed/fake progress animation. Lives here (not the Demo
 * Launcher page itself) because `activate()` navigates to Mission
 * Control immediately, and this overlay is the one piece of UI that
 * survives that navigation.
 */
function useLaunchSteps(): LaunchStep[] {
  const replay = useReplay();
  const presentationMode = usePresentationMode();
  const location = useLocation();

  const datasetLoaded = replay.target !== null && replay.allTimestamps.length > 0;
  const stateRestored =
    datasetLoaded && replay.currentIndex === replay.allTimestamps.length - 1;

  return [
    { label: "Loading demo dataset", done: datasetLoaded },
    { label: "Restoring presentation state", done: stateRestored },
    { label: "Opening Mission Control", done: location.pathname === "/mission-control" },
    { label: "Enabling Judge Mode", done: presentationMode.active },
    { label: "Starting Presentation Mode", done: presentationMode.active },
  ];
}

export function JudgeQuickViewOverlay() {
  const { talkingPointsVisible, launchTriggered, dismissTalkingPoints } = useJudgeQuickView();
  const steps = useLaunchSteps();
  const presentationMode = usePresentationMode();

  // Escape already exits Presentation Mode's own fullscreen chrome
  // (PresentationModeContext's own listener); without this, this
  // overlay - which has no listener of its own - would keep floating
  // over the now-plain page instead of leaving with the rest of the
  // chrome it was shown alongside.
  useEffect(() => {
    if (!presentationMode.active && talkingPointsVisible) {
      dismissTalkingPoints();
    }
  }, [presentationMode.active, talkingPointsVisible, dismissTalkingPoints]);

  if (!talkingPointsVisible) {
    return null;
  }

  return (
    <div className="judge-quick-view-overlay">
      <button
        type="button"
        className="judge-quick-view-dismiss"
        onClick={dismissTalkingPoints}
        aria-label="Dismiss talking points"
      >
        &times;
      </button>
      {launchTriggered && (
        <ul className="judge-quick-view-launch-steps" aria-label="Launch sequence">
          {steps.map((step) => (
            <li key={step.label} className={step.done ? "launch-step-done" : "launch-step-pending"}>
              <span aria-hidden="true">{step.done ? "✓" : "…"}</span> {step.label}
            </li>
          ))}
        </ul>
      )}
      <TalkingPointsPanel points={JUDGE_QUICK_VIEW_TALKING_POINTS} />
    </div>
  );
}
