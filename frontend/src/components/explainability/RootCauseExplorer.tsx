import type { CounterfactualComparison, RiskAssessment } from "../../api/types";
import { buildAgentContributionReason } from "../../lib/agentContributionReasons";
import { explainComparison } from "../../lib/decisionComparison";
import type { RiskJustification } from "../../lib/justification";
import { hasInteractionBonus, rankContributingFactors } from "../../lib/rootCause";
import { RulesFiredList } from "./RulesFiredList";

/**
 * Item 3 (Root Cause Explorer) - "Why did this happen?" Every section
 * is a pure re-derivation over already-persisted data this tick's
 * `RiskAssessment`/`CounterfactualComparison` already carries: top
 * contributing factors (`rankContributingFactors`, sorted by the
 * exact `agent_contributions.risk` values), the interaction bonus (the
 * same `rules_fired` check the rest of the app uses), rules fired
 * (`RulesFiredList`, reused), the counterfactual comparison
 * (`explainComparison`, reused from Decision Comparison), and the
 * affected workers/permits/equipment already available from the same
 * hooks the Plant Map and Executive dashboard use. Nothing here is
 * recomputed.
 */
export function RootCauseExplorer({
  assessment,
  justification,
  counterfactual,
  workerCount,
  hasActivePermit,
}: {
  assessment: RiskAssessment;
  justification: RiskJustification | null;
  counterfactual?: CounterfactualComparison;
  workerCount?: number;
  hasActivePermit?: boolean;
}) {
  const factors = rankContributingFactors(justification);
  const bonusApplied = hasInteractionBonus(justification);
  const equipmentRisk = justification?.agentContributions.equipment_status?.risk;

  const comparisonText = counterfactual
    ? explainComparison(
        {
          compound_risk_score: assessment.compound_risk_score,
          confidence: assessment.confidence,
          tier: assessment.tier,
        },
        counterfactual.counterfactual,
        justification,
      )
    : null;

  return (
    <div className="card root-cause-explorer">
      <h3>Why did this happen?</h3>

      <h4>Top Contributing Factors</h4>
      {factors.length === 0 ? (
        <p>No agent contributions recorded for this tick.</p>
      ) : (
        <ol className="root-cause-factor-list">
          {factors.map((factor) => (
            <li key={factor.agentName}>
              <strong>{factor.displayName}:</strong> {factor.risk.toFixed(1)} risk (
              {(factor.confidence * 100).toFixed(0)}% confidence)
              {justification && (
                <p className="agent-contribution-reason">
                  Reason: {buildAgentContributionReason(
                    factor.agentName,
                    { risk: factor.risk, confidence: factor.confidence },
                    justification,
                  )}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {bonusApplied && justification && (
        <p className="root-cause-bonus">
          <strong>Interaction bonus:</strong> ×{justification.interactionBonusApplied.toFixed(2)} -
          multiple independent factors compounding at once.
        </p>
      )}

      <h4>Rules Fired</h4>
      <RulesFiredList rules={justification?.rulesFired ?? []} />

      {comparisonText && (
        <>
          <h4>Alternative Decision Comparison</h4>
          <p>{comparisonText}</p>
        </>
      )}

      <h4>Affected</h4>
      <ul className="root-cause-affected-list">
        <li>Workers in zone: {workerCount ?? "unknown"}</li>
        <li>Active work authorization: {hasActivePermit ? "Yes" : "No"}</li>
        <li>Equipment risk: {equipmentRisk !== undefined ? equipmentRisk.toFixed(1) : "n/a"}</li>
      </ul>
    </div>
  );
}
