import { Link, useParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { PipelineDiagram } from "../components/explainability/PipelineDiagram";
import { useRiskAssessment } from "../hooks/useRiskAssessment";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { agentDisplayName, parseJustification } from "../lib/justification";
import { agentStage, groupRulesByStage } from "../lib/pipelineStages";

/**
 * Item 10 (research mode) - every stage of the deterministic pipeline
 * for one persisted assessment, laid out in execution order
 * (Scheduler -> agents -> Fusion -> Tiering -> Justification), plus
 * the raw persisted justification object itself. Unlike the
 * Explainability page (consumer-facing, recommendation-oriented),
 * this page is deliberately closer to the wire: it shows exactly
 * what's in the row, attributed to the stage that produced it, with
 * nothing summarized away. Built entirely from GET /risk/assessment/
 * {assessmentId} (DIL.1) - no new persistence, no new computation.
 */
export function ResearchModePage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { data: assessment, isLoading, error } = useRiskAssessment(assessmentId);
  const { data: zones } = useZones();

  const justification = assessment ? parseJustification(assessment.justification) : null;
  const stages = justification ? groupRulesByStage(justification.rulesFired) : [];

  return (
    <section>
      <p>
        <Link to="/zones">&larr; Zones</Link>
      </p>
      <h1>Research Mode</h1>
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
                {formatTimestamp(assessment.timestamp)} &middot; assessment_id: {assessment.assessment_id}
              </p>
              <p>
                Final output: {assessment.compound_risk_score.toFixed(4)}{" "}
                <TierBadge tier={assessment.tier} /> &middot; Confidence:{" "}
                {assessment.confidence.toFixed(2)}
              </p>
              <p>
                <Link to={`/explain/${assessment.assessment_id}`}>Explainability view &rarr;</Link>
                {" · "}
                <Link
                  to={`/counterfactual/${assessment.zone_id}?timestamp=${encodeURIComponent(assessment.timestamp)}`}
                >
                  Parallel counterfactual branch &rarr;
                </Link>
              </p>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Pipeline</h3>
              <PipelineDiagram assessment={assessment} justification={justification} />
            </div>

            {justification ? (
              <>
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>1. Scheduler</h3>
                  <p>Agents that reported this tick: {Object.keys(justification.agentContributions).join(", ")}</p>
                </div>

                {Object.entries(justification.agentContributions).map(([agentName, contribution]) => {
                  const stage = stages.find((s) => s.stage === agentStage(agentName));
                  return (
                    <div key={agentName} className="card" style={{ marginBottom: "1rem" }}>
                      <h3>2. {agentDisplayName(agentName)} Agent</h3>
                      <p>
                        Raw risk: {contribution.risk.toFixed(4)} &middot; Confidence:{" "}
                        {contribution.confidence.toFixed(2)}
                      </p>
                      {stage && (
                        <ul className="rules-fired-list">
                          {stage.rules.map((rule) => (
                            <li key={rule} className="rule-tag">
                              {rule}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>3. Fusion</h3>
                  <p>Interaction bonus applied: {justification.interactionBonusApplied.toFixed(4)}</p>
                  <p>Resulting compound risk score: {assessment.compound_risk_score.toFixed(4)}</p>
                  <ul className="rules-fired-list">
                    {(stages.find((s) => s.stage === "Fusion")?.rules ?? []).map((rule) => (
                      <li key={rule} className="rule-tag">
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>4. Tiering</h3>
                  <p className="tier-transition">
                    <TierBadge tier={justification.tierBefore} /> &rarr;{" "}
                    <TierBadge tier={justification.tierAfter} />
                  </p>
                  <ul className="rules-fired-list">
                    {(stages.find((s) => s.stage === "Tiering")?.rules ?? []).map((rule) => (
                      <li key={rule} className="rule-tag">
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                {stages.some((s) => s.stage === "Unattributed") && (
                  <div className="card" style={{ marginBottom: "1rem" }}>
                    <h3>Unattributed Rules</h3>
                    <p>Rule identifiers this page doesn&apos;t yet have a stage mapping for.</p>
                    <ul className="rules-fired-list">
                      {(stages.find((s) => s.stage === "Unattributed")?.rules ?? []).map((rule) => (
                        <li key={rule} className="rule-tag">
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="card">
                  <h3>5. Persisted Justification (raw)</h3>
                  <pre style={{ overflowX: "auto", fontSize: "0.85rem" }}>
                    {JSON.stringify(assessment.justification, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="card">
                <p>
                  This assessment&apos;s justification doesn&apos;t match the expected schema.
                </p>
                <pre style={{ overflowX: "auto", fontSize: "0.85rem" }}>
                  {JSON.stringify(assessment.justification, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </QueryResult>
    </section>
  );
}
