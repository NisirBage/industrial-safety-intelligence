import type { PrioritizedAction } from "../../lib/actionPlaybook";
import type { RiskJustification } from "../../lib/justification";
import { hasInteractionBonus, rankContributingFactors } from "../../lib/rootCause";

/**
 * Item 4 (Operational Impact Explorer, formerly "Risk Reduction
 * Simulator") - "what does following this recommendation actually
 * touch?" answered entirely in qualitative terms and real,
 * already-persisted numbers (an agent's current raw risk/confidence,
 * whether an interaction bonus is actually applied this tick, which
 * other rules/actions share the same targeted factor). It never shows
 * a projected compound-risk value, because the deterministic engine
 * has no concept of "risk if this specific action were taken" for any
 * of its four agents individually - see docs/architecture/
 * operations_center.md's Known Limitations for why that number is
 * deliberately not synthesized.
 */
export function OperationalImpactExplorer({
  actions,
  justification,
}: {
  actions: PrioritizedAction[];
  justification: RiskJustification | null;
}) {
  const bonusApplied = hasInteractionBonus(justification);
  const ranked = rankContributingFactors(justification);
  const rankByAgent = new Map(ranked.map((factor, index) => [factor.agentName, { ...factor, rank: index }]));

  if (actions.length === 0) {
    return <p>No active recommendations to explore right now.</p>;
  }

  return (
    <ul className="impact-explorer-list">
      {actions.map((action) => {
        const factor = rankByAgent.get(action.metadata.targetedFactor);
        const relatedActions = actions.filter(
          (other) => other.id !== action.id && other.metadata.targetedFactor === action.metadata.targetedFactor,
        );

        return (
          <li key={action.id} className="impact-explorer-item">
            <strong>{action.text}</strong>
            <p className="impact-explorer-level">Expected qualitative improvement: {action.impactLevel}</p>

            {action.metadata.targetedFactor === "interaction_bonus" ? (
              <p>
                {bonusApplied
                  ? `Targets the interaction bonus itself - Fusion is currently applying a ×${justification?.interactionBonusApplied.toFixed(2)} multiplier this tick (rule: interaction_bonus_applied).`
                  : "No interaction bonus is currently applied - this action would be preventative, not corrective."}
              </p>
            ) : factor ? (
              <p>
                Targets <strong>{factor.displayName}</strong> - currently {factor.risk.toFixed(1)} risk (
                {(factor.confidence * 100).toFixed(0)}% confidence), ranked #{factor.rank + 1} of {ranked.length}{" "}
                contributing factors this tick.
                {bonusApplied && factor.rank < 2 && (
                  <> This factor is one of the two highest contributors while the interaction bonus is active.</>
                )}
              </p>
            ) : (
              <p>Targets the current operational status decision, not a single decision contributor.</p>
            )}

            <p className="impact-explorer-evidence">
              Supporting evidence: {action.id.startsWith("tier_") ? `tier_after = ${justification?.tierAfter ?? "n/a"}` : `rule "${action.id}" fired`}
            </p>

            {relatedActions.length > 0 && (
              <p className="impact-explorer-related">
                Related recommendations targeting the same factor: {relatedActions.map((a) => a.text).join("; ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
