import { Link, useParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { AgentContributionChart } from "../components/explainability/AgentContributionChart";
import { ConfidenceBreakdown } from "../components/explainability/ConfidenceBreakdown";
import { DecisionStabilityPanel } from "../components/explainability/DecisionStabilityPanel";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { RulesFiredList } from "../components/explainability/RulesFiredList";
import { useHistoricalMatches } from "../hooks/useHistoricalMatches";
import { useRiskAssessment } from "../hooks/useRiskAssessment";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useScenarios } from "../hooks/useScenarios";
import { useForesightForecast } from "../hooks/useForesightForecast";
import { useZones } from "../hooks/useZones";
import { buildConfidenceBreakdown } from "../lib/confidenceBreakdown";
import { buildRecommendationStability } from "../lib/decisionStability";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";
import { resolveScenarioKey } from "../lib/scenarioResolution";

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
  const { data: scenarios } = useScenarios();

  const justification = assessment ? parseJustification(assessment.justification) : null;

  const { data: historicalMatches } = useHistoricalMatches(
    assessment?.zone_id,
    assessment?.timestamp,
  );
  const scenarioKey = resolveScenarioKey(scenarios, assessment?.zone_id, assessment?.timestamp);
  const { data: foresight } = useForesightForecast(
    assessment?.zone_id,
    assessment?.timestamp,
    scenarioKey,
  );
  const confidenceFactors = assessment
    ? buildConfidenceBreakdown(assessment, justification, historicalMatches?.matches[0], foresight)
    : [];

  const { data: riskHistory } = useRiskHistory(assessment?.zone_id, { limit: 50 });
  const stability = buildRecommendationStability(riskHistory?.items ?? [], confidenceFactors);

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
                Overall plant risk: {assessment.compound_risk_score.toFixed(1)}{" "}
                <TierBadge tier={assessment.tier} /> &middot; Confidence:{" "}
                {(assessment.confidence * 100).toFixed(0)}%
              </p>
              <p>
                <Link to={`/decision-workspace/${assessment.assessment_id}`}>
                  Open Decision Workspace &rarr;
                </Link>{" "}
                &middot;{" "}
                <Link to={`/research/${assessment.assessment_id}`}>Open in Research Mode &rarr;</Link>{" "}
                &middot;{" "}
                <Link to={`/decision-report/${assessment.assessment_id}`}>
                  Open Decision Report &rarr;
                </Link>
              </p>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Confidence Breakdown</h3>
              <ConfidenceBreakdown factors={confidenceFactors} />
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Decision Stability</h3>
              <DecisionStabilityPanel stability={stability} />
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
                  <h3>Operational Status Change</h3>
                  <p className="tier-transition">
                    <TierBadge tier={justification.tierBefore} /> &rarr;{" "}
                    <TierBadge tier={justification.tierAfter} />
                  </p>
                  <p>
                    Interaction bonus applied: {justification.interactionBonusApplied.toFixed(2)}
                  </p>
                </div>

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>Decision Contributors</h3>
                  <AgentContributionChart
                    contributions={justification.agentContributions}
                    justification={justification}
                  />
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
