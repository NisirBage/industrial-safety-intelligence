import type { NarrativeEntry } from "../../lib/operationalNarrative";
import { formatTimestamp } from "../../lib/format";

/**
 * M28 Part 3 (Operational Narrative) - "instead of only charts": a
 * plain-language, timestamped story of one incident. Every sentence
 * is passed in already generated (`buildOperationalNarrative`) -
 * this component only renders the sequence.
 */
export function OperationalNarrativeTimeline({ entries }: { entries: NarrativeEntry[] }) {
  if (entries.length === 0) {
    return <p>No narrative yet - no ticks recorded for this zone.</p>;
  }

  return (
    <ol className="operational-narrative">
      {entries.map((entry, index) => (
        <li key={entry.timestamp} className="operational-narrative-entry">
          <span className="operational-narrative-time">{formatTimestamp(entry.timestamp)}</span>
          <p className="operational-narrative-sentence">{entry.sentence}</p>
          {index < entries.length - 1 && (
            <span className="operational-narrative-arrow" aria-hidden="true">
              &darr;
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
