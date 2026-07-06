import type { CounterfactualComparison, RiskAssessment } from "../../api/types";
import { ReplayController } from "../replay/ReplayController";
import { AnimatedCounter } from "./AnimatedCounter";
import { explainComparison } from "../../lib/decisionComparison";
import { generateExecutiveExplanation } from "../../lib/executiveExplanation";
import type { PlantReadiness } from "../../lib/executiveKpis";
import type { RiskJustification } from "../../lib/justification";
import { PLATFORM_CAPABILITIES, PLATFORM_STATS } from "../../lib/presentationScript";
import { rankContributingFactors } from "../../lib/rootCause";
import type { Recommendation } from "../../lib/recommendations";

const READINESS_LABEL: Record<PlantReadiness, string> = {
  ready: "Normal — no elevated risk",
  degraded: "Reduced margin — non-normal zones present",
  not_ready: "Operations at risk — a CRITICAL zone is active",
};

/** Scene 7 - the same KPI derivations `ExecutiveOverviewPage` already
 * computes (`averageCompoundScore`, `plantReadiness`,
 * `percentZonesNormal`) plus the same deterministic executive
 * explanation the Decision Graph milestone built. "Business Impact"
 * is a categorical label over `readiness` (never a fabricated dollar
 * figure) - qualitative, matching this platform's established rule
 * for anything without a real underlying computation. */
export function Scene7Executive({
  avgScore,
  readiness,
  normalPercent,
  assessment,
  justification,
  recommendations,
}: {
  avgScore: number;
  readiness: PlantReadiness;
  normalPercent: number;
  assessment: RiskAssessment | undefined;
  justification: RiskJustification | null;
  recommendations: Recommendation[];
}) {
  const explanation = assessment
    ? generateExecutiveExplanation(assessment, justification, recommendations)
    : null;

  return (
    <div className="scene scene-executive">
      <h2 className="scene-heading">Executive Dashboard</h2>
      <div className="scene-title-stats">
        <div>
          <span className="scene-stat-value">
            <AnimatedCounter value={avgScore} decimals={1} />
          </span>
          <span className="scene-stat-label">Current risk</span>
        </div>
        <div>
          <span className="scene-stat-value">{READINESS_LABEL[readiness]}</span>
          <span className="scene-stat-label">Business impact</span>
        </div>
        <div>
          <span className="scene-stat-value">
            <AnimatedCounter value={normalPercent} decimals={0} suffix="%" />
          </span>
          <span className="scene-stat-label">Operational readiness (zones at NORMAL)</span>
        </div>
      </div>
      {explanation && <p className="executive-explanation">{explanation}</p>}
    </div>
  );
}

/** Scene 8 - the real Counterfactual Comparison for the "Current" arm
 * (`explainComparison`, reused unchanged from the Decision Comparison
 * milestone). "Without Permit"/"Equipment Restored" are qualitative-
 * only narratives over already-ranked real contributions
 * (`rankContributingFactors`) - per the milestone's own explicit
 * "Display qualitative change only," never a computed score, since
 * the deterministic engine has no per-agent "what if" branch. */
export function Scene8Counterfactual({
  counterfactual,
  justification,
}: {
  counterfactual: CounterfactualComparison | undefined;
  justification: RiskJustification | null;
}) {
  const ranked = rankContributingFactors(justification);
  const permit = ranked.find((f) => f.agentName === "permit_intelligence");
  const equipment = ranked.find((f) => f.agentName === "equipment_status");

  return (
    <div className="scene scene-counterfactual">
      <h2 className="scene-heading">Alternative Decision</h2>
      <div className="scene-counterfactual-grid">
        <div className="card">
          <h3>Current (compound engine vs naive baseline)</h3>
          <p>
            {counterfactual
              ? explainComparison(counterfactual.compound, counterfactual.counterfactual, justification)
              : "No counterfactual data available for this tick."}
          </p>
        </div>
        <div className="card">
          <h3>Without Permit (qualitative)</h3>
          <p>
            {permit
              ? `Permit Intelligence is currently ranked #${ranked.indexOf(permit) + 1} of ${ranked.length} contributing factors (${permit.risk.toFixed(1)} risk). Removing it would qualitatively reduce compounding pressure, and if it was part of this tick's interaction bonus, that condition would very likely no longer hold.`
              : "No permit-related contribution recorded this tick."}
          </p>
        </div>
        <div className="card">
          <h3>Equipment Restored (qualitative)</h3>
          <p>
            {equipment
              ? `Equipment Status is currently ranked #${ranked.indexOf(equipment) + 1} of ${ranked.length} contributing factors (${equipment.risk.toFixed(1)} risk). Restoring flagged equipment would qualitatively remove this factor's pressure on the compound score.`
              : "No equipment-related contribution recorded this tick."}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Scene 9 - the exact `ReplayController` the Time Machine already
 * built, reused unchanged; the parent page drives playback
 * (`replay.play()`/`replay.pause()`) as a scene-enter/exit side
 * effect, so this component stays purely presentational. */
export function Scene9Replay() {
  return (
    <div className="scene scene-replay">
      <h2 className="scene-heading">Time Machine Replay</h2>
      <ReplayController />
    </div>
  );
}

/** Scene 10 - closing platform statistics, every one independently
 * verified against the codebase (`lib/presentationScript.ts::
 * PLATFORM_STATS`'s own docstring), animated as counters. */
export function Scene10Closing() {
  return (
    <div className="scene scene-closing">
      <div className="scene-closing-stats">
        {PLATFORM_STATS.map((stat) => (
          <div key={stat.label}>
            <span className="scene-stat-value">
              <AnimatedCounter value={stat.value} suffix={stat.suffix ?? ""} />
            </span>
            <span className="scene-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
      <ul className="scene-closing-capabilities">
        {PLATFORM_CAPABILITIES.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
      <h1 className="scene-title-heading">Industrial Safety Intelligence Platform</h1>
      <p className="scene-closing-tagline">Deterministic &bull; Explainable &bull; Production Ready</p>
    </div>
  );
}
