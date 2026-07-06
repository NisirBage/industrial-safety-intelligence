import { DemoReadinessPanel } from "../components/presentation/DemoReadinessPanel";
import { useJudgeQuickView } from "../context/JudgeQuickViewContext";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { useScenarios } from "../hooks/useScenarios";

/**
 * M21 Part 1 (One-Click Demo) - a pre-flight dry run distinct from
 * Judge Quick View's own instant one-click (`NavBar`'s "Judge Quick
 * View" button): this page is for the presenter's own confidence
 * check minutes before walking on stage, showing exactly which real
 * checks pass or fail before committing to the launch sequence.
 * Reuses `DemoReadinessPanel` (already built for Presentation Mode's
 * launcher) for verification and `useJudgeQuickView().activate()`
 * (already built for M20's Judge Quick View) for the actual launch -
 * this page adds no new verification or startup logic of its own,
 * only composes the two.
 */
export function DemoLauncherPage() {
  const { data: scenarios } = useScenarios();
  const { data: currentRisk } = useCurrentRisk();
  const { activate } = useJudgeQuickView();

  return (
    <section className="demo-launcher-page">
      <h1>Demo Launcher</h1>
      <p className="page-intro">
        One click: verify everything below is real and ready, then launch straight into a
        full-screen, judge-ready Mission Control - the same sequence Judge Quick View runs, shown
        here as a dry run before you're in front of an audience.
      </p>

      <h2 className="section-heading">Pre-Flight Checks</h2>
      <DemoReadinessPanel scenarios={scenarios} currentRisk={currentRisk} />

      <div className="demo-launcher-action">
        <button type="button" className="demo-launcher-button" onClick={activate}>
          &#9654; Launch Demo
        </button>
        <p className="kpi-sub">
          Starts a real replay, restores the cursor to its most escalated tick, opens Mission
          Control, and enables Judge Mode / Presentation Mode - watch the launch sequence
          checklist in the corner once you click.
        </p>
      </div>
    </section>
  );
}
