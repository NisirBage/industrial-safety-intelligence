import { ScenarioPicker } from "../components/replay/ScenarioPicker";
import { TierBadge } from "../components/common/TierBadge";
import { useReplay } from "../context/ReplayContext";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { agentDisplayName, parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";

/**
 * M23 Part 1 (Decision Timeline) - every persisted decision across
 * every zone in the active replay, merged into one chronological feed
 * (not per-zone, unlike `DecisionEvolution`). Every field on a node -
 * timestamp, score, tier, triggered agents, recommended action,
 * confidence - is read straight from that assessment's own persisted
 * `justification`; nothing here is computed. Clicking a node calls the
 * same `ReplayContext.jumpToTimestamp` every other replay-aware page
 * already reads from, so selecting a node updates Digital Twin,
 * Mission Control, Executive Overview, Decision Journal, Counterfactual,
 * and Operations Center in one shared move - no page-specific wiring.
 */
export function DecisionTimelinePage() {
  const replay = useReplay();
  const { data: zones } = useZones();

  if (replay.target === null) {
    return (
      <section>
        <h1>Decision Timeline</h1>
        <p className="page-intro">
          Every decision the engine made, in order - pick a scenario from the library below to
          begin.
        </p>
        <ScenarioPicker />
      </section>
    );
  }

  const nodes = replay.zoneIds
    .flatMap((zoneId) => replay.zoneTimeline(zoneId).map((assessment) => ({ zoneId, assessment })))
    .sort((a, b) => (a.assessment.timestamp < b.assessment.timestamp ? -1 : 1));

  return (
    <section>
      <h1>Decision Timeline</h1>
      <p className="page-intro">
        Every decision across every zone in this replay, chronologically. Select a node to move
        the shared Time Machine cursor - Digital Twin, Mission Control, Executive Overview,
        Decision Journal, Alternative Decision, and Operations Center all follow.
      </p>

      {nodes.length === 0 ? (
        <p>This replay has no persisted decisions yet.</p>
      ) : (
        <ol className="decision-timeline-list">
          {nodes.map(({ zoneId, assessment }, index) => {
            const justification = parseJustification(assessment.justification);
            const recommendations = deriveRecommendations(assessment.tier, justification);
            const triggeredAgents = justification
              ? Object.entries(justification.agentContributions)
                  .filter(([, contribution]) => contribution.risk > 0)
                  .map(([agentName]) => agentDisplayName(agentName))
              : [];
            const isCurrent = assessment.timestamp === replay.currentTimestamp;
            const isPast = replay.currentTimestamp !== null && assessment.timestamp <= replay.currentTimestamp;

            return (
              <li key={`${zoneId}-${assessment.assessment_id}`}>
                <button
                  type="button"
                  className={`decision-timeline-node${isCurrent ? " decision-timeline-node-current" : ""}${
                    isPast ? " decision-timeline-node-past" : ""
                  }`}
                  style={{ animationDelay: `${Math.min(index, 40) * 20}ms` }}
                  onClick={() => replay.jumpToTimestamp(assessment.timestamp)}
                >
                  <div className="decision-timeline-node-header">
                    <span className="decision-timeline-node-time">{formatTimestamp(assessment.timestamp)}</span>
                    <span>{zoneLabel(zoneId, zones)}</span>
                    <TierBadge tier={assessment.tier} />
                    <span className="kpi-sub">{assessment.compound_risk_score.toFixed(1)}</span>
                    <span className="kpi-sub">Confidence {(assessment.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="decision-timeline-node-agents">
                    {triggeredAgents.length > 0
                      ? `Triggered: ${triggeredAgents.join(", ")}`
                      : "No agent flagged elevated risk this tick."}
                  </p>
                  {recommendations[0] && (
                    <p className="decision-timeline-node-recommendation">{recommendations[0].text}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
