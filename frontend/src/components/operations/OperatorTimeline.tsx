import { formatTimestamp } from "../../lib/format";

export interface TimelineEntry {
  timestamp: string;
  label: string;
  kind: string;
}

/**
 * Item 6 (Operator Timeline) - one chronological list, fed from
 * either the Time Machine's own persisted bookmarks (replay mode) or
 * `lib/operatorTimeline.ts::deriveTimelineEvents` (live mode) -
 * whichever the page is in, this component only ever renders already-
 * computed `TimelineEntry` values, so it never needs to know which
 * source produced them. `onJump`, when provided (replay mode only),
 * lets clicking an entry move the shared `ReplayContext` cursor to
 * that moment - the same "jump to timestamp" primitive the Time
 * Machine's own controller already exposes, reused rather than
 * reimplemented.
 */
export function OperatorTimeline({
  entries,
  onJump,
}: {
  entries: TimelineEntry[];
  onJump?: (timestamp: string) => void;
}) {
  if (entries.length === 0) {
    return <p>No incident events recorded in this window yet.</p>;
  }

  return (
    <ol className="operator-timeline">
      {entries.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} className={`operator-timeline-entry operator-timeline-${entry.kind}`}>
          {onJump ? (
            <button type="button" className="operator-timeline-jump" onClick={() => onJump(entry.timestamp)}>
              <span className="operator-timeline-time">{formatTimestamp(entry.timestamp)}</span>
              <span className="operator-timeline-label">{entry.label}</span>
            </button>
          ) : (
            <>
              <span className="operator-timeline-time">{formatTimestamp(entry.timestamp)}</span>
              <span className="operator-timeline-label">{entry.label}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
