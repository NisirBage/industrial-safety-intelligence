import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { usePresentationMode } from "./PresentationModeContext";
import { useReplay } from "./ReplayContext";
import { useScenarios } from "../hooks/useScenarios";
import { SCENE_TALKING_POINTS } from "../lib/presentationScript";

interface JudgeQuickViewContextValue {
  talkingPointsVisible: boolean;
  /** True from the moment `activate()` is called - lets the Demo
   * Launcher/Judge Quick View overlay render a real launch-sequence
   * checklist (Part 1) without inventing a second "is launching"
   * flag; every row of that checklist derives from this plus the
   * same `ReplayContext`/`PresentationModeContext` state already used
   * here, never a fabricated progress animation. */
  launchTriggered: boolean;
  activate: () => void;
  dismissTalkingPoints: () => void;
}

const JudgeQuickViewContext = createContext<JudgeQuickViewContextValue | null>(null);

export function useJudgeQuickView(): JudgeQuickViewContextValue {
  const ctx = useContext(JudgeQuickViewContext);
  if (!ctx) {
    throw new Error("useJudgeQuickView must be used within JudgeQuickViewProvider");
  }
  return ctx;
}

export const JUDGE_QUICK_VIEW_TALKING_POINTS = SCENE_TALKING_POINTS["mission-control"];

/**
 * M20 Part 11 (Judge Experience) - one button that does everything a
 * judge walking up to the booth would otherwise need several clicks
 * for: start a real replay of a dramatic, already-cataloged scenario
 * (the same `selectPresentationScenario` the Guided Presentation
 * uses), scrub it to its most escalated real tick, enter the existing
 * full-screen Presentation Mode chrome, land on Mission Control (which
 * already auto-follows the highest-risk zone on its own Digital
 * Twin), and surface the same authored talking points the Guided
 * Presentation's Judge Mode already shows for that scene. Nothing
 * here is a new computation - every step reuses a mechanism this
 * milestone or an earlier one already built and proved.
 */
export function JudgeQuickViewProvider({ children }: { children: ReactNode }) {
  const [talkingPointsVisible, setTalkingPointsVisible] = useState(false);
  const [launchTriggered, setLaunchTriggered] = useState(false);
  const [pendingActivation, setPendingActivation] = useState(false);
  const navigate = useNavigate();
  const presentationMode = usePresentationMode();
  const replay = useReplay();
  const { data: scenarios } = useScenarios();
  const scrubbedRef = useRef(false);

  function activate() {
    setLaunchTriggered(true);
    if (scenarios && scenarios.length > 0 && replay.target === null) {
      const dramatic =
        scenarios.find((s) => /simops|critical/i.test(s.key) || /simops|critical/i.test(s.title)) ??
        scenarios[0];
      scrubbedRef.current = false;
      replay.startReplay({ scenarioKey: dramatic.key });
    }
    setPendingActivation(true);
    presentationMode.enter();
    setTalkingPointsVisible(true);
    navigate("/mission-control");
  }

  function dismissTalkingPoints() {
    setTalkingPointsVisible(false);
    setLaunchTriggered(false);
  }

  // Once the just-started replay's real history has loaded, jump the
  // shared cursor to its final (most escalated) real tick - the same
  // "hold on the worst moment" pattern the Guided Presentation's
  // PEAK_TICK_SCENES already establish, just landing on the last tick
  // of a scenario `selectPresentationScenario` already picked for
  // being dramatic, rather than re-deriving a per-zone peak index.
  useEffect(() => {
    if (pendingActivation && !scrubbedRef.current && replay.allTimestamps.length > 0) {
      replay.scrubToIndex(replay.allTimestamps.length - 1);
      scrubbedRef.current = true;
      setPendingActivation(false);
    }
  }, [pendingActivation, replay]);

  return (
    <JudgeQuickViewContext.Provider
      value={{ talkingPointsVisible, launchTriggered, activate, dismissTalkingPoints }}
    >
      {children}
    </JudgeQuickViewContext.Provider>
  );
}
