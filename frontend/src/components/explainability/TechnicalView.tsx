import type { ReplayBookmark, RiskAssessment } from "../../api/types";
import { buildAgentContributionReason } from "../../lib/agentContributionReasons";
import { formatTimestamp } from "../../lib/format";
import { agentDisplayName, type RiskJustification } from "../../lib/justification";
import { RulesFiredList } from "./RulesFiredList";

/**
 * Item 8 (Technical View) - raw contributions, raw scores,
 * intermediate values, confidence, rules fired, and bookmarks, laid
 * out densely for a judge who wants to verify the numbers themselves
 * rather than read a narrative. Every value here is copied directly
 * off the persisted `RiskAssessment`/`justification`/bookmark rows -
 * nothing is recomputed, formatted with a curve, or summarized away.
 */
export function TechnicalView({
  assessment,
  justification,
  bookmarks,
}: {
  assessment: RiskAssessment;
  justification: RiskJustification | null;
  bookmarks: ReplayBookmark[];
}) {
  return (
    <div className="technical-view-grid">
      <div className="card">
        <h4>Assessment (raw)</h4>
        <dl>
          <dt>assessment_id</dt>
          <dd>{assessment.assessment_id}</dd>
          <dt>timestamp</dt>
          <dd>{assessment.timestamp}</dd>
          <dt>compound_risk_score</dt>
          <dd>{assessment.compound_risk_score}</dd>
          <dt>confidence</dt>
          <dd>{assessment.confidence}</dd>
          <dt>tier</dt>
          <dd>{assessment.tier}</dd>
        </dl>
      </div>

      {justification ? (
        <>
          <div className="card">
            <h4>Fusion / Tiering (raw)</h4>
            <dl>
              <dt>schema_version</dt>
              <dd>{justification.schemaVersion}</dd>
              <dt>interaction_bonus_applied</dt>
              <dd>{justification.interactionBonusApplied}</dd>
              <dt>tier_before</dt>
              <dd>{justification.tierBefore}</dd>
              <dt>tier_after</dt>
              <dd>{justification.tierAfter}</dd>
            </dl>
          </div>

          {Object.entries(justification.agentContributions).map(([agentName, contribution]) => (
            <div className="card" key={agentName}>
              <h4>{agentDisplayName(agentName)} (raw)</h4>
              <dl>
                <dt>risk</dt>
                <dd>{contribution.risk}</dd>
                <dt>confidence</dt>
                <dd>{contribution.confidence}</dd>
              </dl>
              <p className="agent-contribution-reason">
                Reason: {buildAgentContributionReason(agentName, contribution, justification)}
              </p>
            </div>
          ))}

          <div className="card">
            <h4>Rules Fired ({justification.rulesFired.length})</h4>
            <RulesFiredList rules={justification.rulesFired} />
          </div>
        </>
      ) : (
        <div className="card">
          <p>No structured justification available for this tick.</p>
        </div>
      )}

      <div className="card">
        <h4>Bookmarks in window ({bookmarks.length})</h4>
        {bookmarks.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul>
            {bookmarks.map((bookmark, index) => (
              <li key={index}>
                [{bookmark.kind}] {bookmark.label} @ {formatTimestamp(bookmark.timestamp)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
