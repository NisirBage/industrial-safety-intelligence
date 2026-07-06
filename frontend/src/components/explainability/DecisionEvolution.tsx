import { useReplay } from "../../context/ReplayContext";
import { useZones } from "../../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../../lib/format";
import { parseJustification } from "../../lib/justification";
import { TierBadge } from "../common/TierBadge";
import { AgentContributionChart } from "./AgentContributionChart";

/**
 * M23 Part 3 (Decision Evolution) - extracted from Time Machine (where
 * it originated) so Mission Control, Presentation Mode, and any future
 * page can mount the exact same view instead of a second copy. Every
 * tick up to the replay cursor for one zone, showing each tick's agent
 * contributions and interaction bonus so a viewer can see WHY the tier
 * changed, not just that it did. Every number is the exact persisted
 * `justification` for that tick - nothing is recomputed.
 */
export function DecisionEvolution({ zoneId }: { zoneId: string }) {
  const replay = useReplay();
  const { data: zones } = useZones();

  const timeline = replay.zoneTimeline(zoneId);
  const upToCursor = timeline.filter(
    (a) => replay.currentTimestamp !== null && a.timestamp <= replay.currentTimestamp,
  );

  return (
    <div className="card">
      <h3>Decision Evolution - {zoneLabel(zoneId, zones)}</h3>
      {upToCursor.length === 0 ? (
        <p>No ticks yet at this point in the replay.</p>
      ) : (
        <ol className="decision-evolution-list">
          {upToCursor.map((assessment) => {
            const justification = parseJustification(assessment.justification);
            return (
              <li key={assessment.assessment_id} className="decision-evolution-tick">
                <p>
                  <strong>{formatTimestamp(assessment.timestamp)}</strong>{" "}
                  {assessment.compound_risk_score.toFixed(1)}{" "}
                  <TierBadge tier={assessment.tier} />
                </p>
                {justification && (
                  <>
                    <AgentContributionChart contributions={justification.agentContributions} />
                    {justification.interactionBonusApplied > 1 &&
                      justification.rulesFired.includes("interaction_bonus_applied") && (
                        <p className="decision-evolution-bonus">
                          Interaction bonus: ×{justification.interactionBonusApplied.toFixed(2)}
                        </p>
                      )}
                    {justification.tierBefore !== justification.tierAfter && (
                      <p className="decision-evolution-transition">
                        {justification.tierBefore} &rarr; {justification.tierAfter}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
