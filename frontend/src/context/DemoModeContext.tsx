import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { findScenarioKeyMoment } from "../lib/demoMode";

/** Curation choice, not data: which persisted scenario best
 * demonstrates the platform's own thesis (SIMOPS interaction bonus
 * catching a divergence a naive baseline misses entirely - see
 * scenarios/scenario_simops_conflict.yaml's own docstring). */
const FLAGSHIP_SCENARIO_KEY = "scenario_simops_conflict";

interface DemoStep {
  path: string;
  label: string;
  durationMs: number;
}

interface DemoModeContextValue {
  active: boolean;
  loading: boolean;
  stepNumber: number;
  totalSteps: number;
  stepLabel: string | null;
  startDemo: () => void;
  stopDemo: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    throw new Error("useDemoMode must be used within DemoModeProvider");
  }
  return ctx;
}

/**
 * Item 7 (Demo Mode) - "Start Demo" drives one fixed navigation
 * sequence: the flagship scenario's replay (autoplaying), then
 * Explainability, Research Mode, and Counterfactual for the single
 * most dramatic real moment that scenario contains, then the
 * Executive Overview. Every step is a real route this app already
 * has; this component only sequences `navigate()` calls on a timer,
 * it renders nothing of its own data.
 */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const timeoutRef = useRef<number | null>(null);

  function clearTimer() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function stopDemo() {
    clearTimer();
    setActive(false);
    setLoading(false);
    setStepIndex(0);
    setSteps([]);
  }

  async function startDemo() {
    clearTimer();
    setActive(true);
    setLoading(true);
    setStepIndex(0);

    const moment = await findScenarioKeyMoment(FLAGSHIP_SCENARIO_KEY).catch(() => null);

    const builtSteps: DemoStep[] = [
      {
        path: `/scenarios/${FLAGSHIP_SCENARIO_KEY}?autoplay=1`,
        label: "Loading the flagship scenario and playing its replay",
        durationMs: 7000,
      },
    ];
    if (moment) {
      builtSteps.push(
        {
          path: `/explain/${moment.assessmentId}`,
          label: "Explainability - why the engine reached this verdict",
          durationMs: 6000,
        },
        {
          path: `/research/${moment.assessmentId}`,
          label: "Research Mode - every pipeline stage, in order",
          durationMs: 6000,
        },
        {
          path: `/counterfactual/${moment.zoneId}?timestamp=${encodeURIComponent(moment.timestamp)}`,
          label: "Counterfactual - the naive baseline, side by side",
          durationMs: 6000,
        },
      );
    }
    builtSteps.push({
      path: "/executive",
      label: "Executive Overview - the plant-wide summary",
      durationMs: 6000,
    });

    setSteps(builtSteps);
    setLoading(false);
  }

  useEffect(() => {
    if (!active || steps.length === 0) {
      return;
    }
    if (stepIndex >= steps.length) {
      stopDemo();
      return;
    }
    navigate(steps[stepIndex].path);
    timeoutRef.current = window.setTimeout(() => {
      setStepIndex((index) => index + 1);
    }, steps[stepIndex].durationMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, steps, stepIndex]);

  useEffect(() => clearTimer, []);

  const value: DemoModeContextValue = {
    active,
    loading,
    stepNumber: stepIndex + 1,
    totalSteps: steps.length,
    stepLabel: steps[stepIndex]?.label ?? null,
    startDemo,
    stopDemo,
  };

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}
