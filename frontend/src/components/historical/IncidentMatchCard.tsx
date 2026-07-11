import type { IncidentMatch } from "../../api/types";
import { TierBadge } from "../common/TierBadge";
import { formatTimestamp } from "../../lib/format";
import { SimilarityRadar } from "./SimilarityRadar";

/**
 * M24 Part 5/6/10 (incident matches + lessons learned) - one similar
 * past incident, exactly as `IncidentMatch` returned it: similarity
 * score, real outcome tier, root cause/business/operational/safety
 * impact, matching/differing features (as a radar), every lesson
 * learned, and the exact evidence source for audit. Context only -
 * never renders a recommendation of its own.
 */
export function IncidentMatchCard({ match, rank }: { match: IncidentMatch; rank: number }) {
  return (
    <div className="card historical-match-card">
      <div className="historical-match-header">
        <span className="historical-match-rank">#{rank}</span>
        <div>
          <h4>{match.incident_name}</h4>
          <p className="kpi-sub">{formatTimestamp(match.date)}</p>
        </div>
        <TierBadge tier={match.outcome_tier} />
        <span className="historical-match-similarity">{(match.similarity * 100).toFixed(0)}% similar</span>
      </div>

      <dl className="historical-match-impact">
        <dt>Root cause</dt>
        <dd>{match.root_cause}</dd>
        <dt>Business impact</dt>
        <dd>{match.business_impact}</dd>
        <dt>Operational impact</dt>
        <dd>{match.operational_impact}</dd>
        <dt>Safety impact</dt>
        <dd>{match.safety_impact}</dd>
      </dl>

      <h5>Feature agreement</h5>
      <SimilarityRadar
        matchingFeatures={match.matching_features}
        differingFeatures={match.differing_features}
      />

      <h5>Lessons learned</h5>
      {match.lessons_learned.length === 0 ? (
        <p className="kpi-sub">No specific lesson recorded for this match's triggered rules.</p>
      ) : (
        <ul className="historical-lessons-list">
          {match.lessons_learned.map((lesson) => (
            <li key={lesson.rule} className="historical-lesson-card">
              <span className="rule-tag">{lesson.rule}</span>
              <p>{lesson.lesson}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="historical-evidence-source">Evidence: {match.evidence_source}</p>
    </div>
  );
}
