import { Link, useParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { AgentContributionChart } from "../components/explainability/AgentContributionChart";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { RulesFiredList } from "../components/explainability/RulesFiredList";
import { useRiskAssessment } from "../hooks/useRiskAssessment";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";

/**
 * Item 4 (explainability dashboard) - the "why" behind one persisted
 * assessment, built entirely from its own `justification` column
 * (GET /risk/assessment/{assessmentId}, DIL.1). Never recomputes
 * anything; every number and rule shown here is copied straight out
 * of what the frozen Justification Builder already wrote.
 */
export function ExplainabilityPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { data: assessment, isLoading, error } = useRiskAssessment(assessmentId);
  const { data: zones } = useZones();

  const justification = assessment ? parseJustification(assessment.justification) : null;

  return (
    <section>
      <p>
        <Link to="/zones">&larr; Zones</Link>
      </p>
      <h1>Explain This Assessment</h1>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!assessment}
        emptyLabel="Assessment not found."
      >
        {assessment && (
          <>
            <div className="card" style={{ marginBottom: "1rem" }}>
              <p>
                <strong>{zoneLabel(assessment.zone_id, zones)}</strong> &middot;{" "}
                {formatTimestamp(assessment.timestamp)}
              </p>
              <p>
                Compound risk score: {assessment.compound_risk_score.toFixed(1)}{" "}
                <TierBadge tier={assessment.tier} /> &middot; Confidence:{" "}
                {(assessment.confidence * 100).toFixed(0)}%
              </p>
              <p>
                <Link to={`/research/${assessment.assessment_id}`}>Open in Research Mode &rarr;</Link>
              </p>
            </div>

            {justification ? (
              <>
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>Recommended Actions</h3>
                  <RecommendationList
                    recommendations={deriveRecommendations(assessment.tier, justification)}
                  />
                </div>

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>Tier Transition</h3>
                  <p className="tier-transition">
                    <TierBadge tier={justification.tierBefore} /> &rarr;{" "}
                    <TierBadge tier={justification.tierAfter} />
                  </p>
                  <p>
                    Interaction bonus applied: {justification.interactionBonusApplied.toFixed(2)}
                  </p>
                </div>

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>Agent Contributions</h3>
                  <AgentContributionChart contributions={justification.agentContributions} />
                </div>

                <div className="card">
                  <h3>Rules Fired</h3>
                  <RulesFiredList rules={justification.rulesFired} />
                </div>
              </>
            ) : (
              <div className="card">
                <p>
                  This assessment&apos;s justification doesn&apos;t match the expected schema, so
                  no further breakdown can be shown.
                </p>
              </div>
            )}
          </>
        )}
      </QueryResult>
    </section>
  );
}
