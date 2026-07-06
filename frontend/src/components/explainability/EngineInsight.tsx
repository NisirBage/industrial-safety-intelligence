import type { RiskAssessment } from "../../api/types";
import type { RiskJustification } from "../../lib/justification";
import { agentDisplayName } from "../../lib/justification";
import { deriveRecommendations } from "../../lib/recommendations";
import { TierBadge } from "../common/TierBadge";

interface Step {
  label: string;
  detail: string;
}

/**
 * M23 Part 7 (Engine Insight) - a 5-step, judge-friendly condensation
 * of the same pipeline `PipelineDiagram` already shows in full
 * technical detail (Sensors -> Context Builders -> 4 Agents -> Fusion
 * -> Tiering -> Explainability -> Recommendations). This component
 * groups those into 5 plain-language steps and reads only fields
 * already on the assessment/justification - nothing here recomputes
 * anything, it is purely a simpler presentation of the same frozen
 * pipeline's own output. `PipelineDiagram`'s detailed/technical view
 * is unchanged and still available for anyone who wants the full
 * evidence trail.
 */
export function EngineInsight({
  assessment,
  justification,
}: {
  assessment: RiskAssessment;
  justification: RiskJustification | null;
}) {
  if (!justification) {
    return (
      <div className="card engine-insight">
        <h3>How the Engine Reached This Decision</h3>
        <p>No structured justification is available for this tick.</p>
      </div>
    );
  }

  const agentSummary = Object.entries(justification.agentContributions)
    .map(([name, contribution]) => `${agentDisplayName(name)} ${contribution.risk.toFixed(0)}`)
    .join(", ");
  const recommendations = deriveRecommendations(assessment.tier, justification);

  const steps: Step[] = [
    {
      label: "Sensor observations",
      detail:
        justification.rulesFired.includes("agent_unavailable_using_last_known") ||
        justification.rulesFired.includes("stale_data_fail_safe")
          ? "One or more readings were missing or stale - the engine fell back to a safe last-known value."
          : "Fresh sensor and status data came in for this tick.",
    },
    {
      label: "Agent reasoning",
      detail: agentSummary || "No agent produced a contribution this tick.",
    },
    {
      label: "Risk fusion",
      detail:
        justification.interactionBonusApplied > 1
          ? `Combined into a compound score of ${assessment.compound_risk_score.toFixed(1)} (×${justification.interactionBonusApplied.toFixed(2)} interaction bonus applied).`
          : `Combined into a compound score of ${assessment.compound_risk_score.toFixed(1)}.`,
    },
    {
      label: "Operational status",
      detail: `${justification.tierBefore.toUpperCase()} → ${justification.tierAfter.toUpperCase()}`,
    },
    {
      label: "Recommended action",
      detail: recommendations[0]?.text ?? "No action recommended at this tier.",
    },
  ];

  return (
    <div className="card engine-insight">
      <h3>How the Engine Reached This Decision</h3>
      <ol className="engine-insight-steps">
        {steps.map((step, index) => (
          <li key={step.label} className="engine-insight-step">
            <span className="engine-insight-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <p className="engine-insight-step-label">{step.label}</p>
              <p className="kpi-sub">
                {step.label === "Operational status" ? <TierBadge tier={assessment.tier} /> : null} {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
