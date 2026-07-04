import { useDemoMode } from "../../context/DemoModeContext";

export function DemoModeBanner() {
  const { active, loading, stepNumber, totalSteps, stepLabel, stopDemo } = useDemoMode();

  if (!active) {
    return null;
  }

  return (
    <div className="demo-mode-banner" role="status">
      <span>
        {loading
          ? "Demo Mode - preparing…"
          : `Demo Mode - step ${stepNumber}/${totalSteps}: ${stepLabel}`}
      </span>
      <button type="button" onClick={stopDemo}>
        Exit Demo
      </button>
    </div>
  );
}
