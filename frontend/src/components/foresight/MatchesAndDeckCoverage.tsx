import type { DeckContribution, ForesightConfidence, ForesightMatchSummary } from "../../api/types";
import { formatTimestamp } from "../../lib/format";

function evidenceQualityLabel(confidence: ForesightConfidence): string {
  const weakest = Math.min(confidence.trajectory_similarity, confidence.replay_coverage);
  if (weakest >= 0.66) return "High";
  if (weakest >= 0.33) return "Moderate";
  return "Low";
}

/**
 * M25 Part 9/10 (Historical overlays, Multi-Deck Support) - every
 * matched historical trajectory that contributed to this forecast,
 * plus which deck(s) they came from and how many incidents matched
 * per deck. "Evidence quality" is a deterministic qualitative label
 * (High/Moderate/Low) derived from the weaker of trajectory
 * similarity and replay coverage - never a fabricated score.
 */
export function MatchesAndDeckCoverage({
  matches,
  deckContributions,
  confidence,
}: {
  matches: ForesightMatchSummary[];
  deckContributions: DeckContribution[];
  confidence: ForesightConfidence;
}) {
  return (
    <div className="foresight-matches-overlay">
      <div className="foresight-deck-coverage">
        <span>Evidence quality: <strong>{evidenceQualityLabel(confidence)}</strong></span>
        {deckContributions.map((deck) => (
          <span key={deck.deck_key} className="kpi-sub">
            {deck.deck_name}: {deck.matched_incident_count} incident(s) matched
          </span>
        ))}
      </div>
      <ul className="foresight-matches-list">
        {matches.map((match) => (
          <li key={`${match.scenario_key}-${match.anchor_timestamp}`}>
            <span className="rule-tag">{match.incident_name}</span>{" "}
            <span className="kpi-sub">
              {(match.similarity * 100).toFixed(0)}% similar - matched at {formatTimestamp(match.anchor_timestamp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
