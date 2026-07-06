import { useReplay } from "../../context/ReplayContext";
import { useZones } from "../../hooks/useZones";
import { businessStoryLine } from "../../lib/executiveExplanation";
import { formatTimestamp, zoneLabel } from "../../lib/format";
import { parseJustification } from "../../lib/justification";

/**
 * M23 Part 6 (Executive Story) - a chronological, business-friendly
 * narration of a replay, one short line per tick across the given
 * zones (e.g. "09:31 Gas concentration increasing."), growing as the
 * replay cursor advances. Every line is `businessStoryLine` over a
 * persisted assessment already in `ReplayContext` - nothing here is
 * computed beyond formatting. Reused by Executive Overview, Mission
 * Control, and Challenge Mode so there is exactly one narration feed,
 * not three.
 */
export function ExecutiveStoryPanel({ zoneIds }: { zoneIds: string[] }) {
  const replay = useReplay();
  const { data: zones } = useZones();
  const cursorTimestamp = replay.currentTimestamp;

  const lines = zoneIds
    .flatMap((zoneId) =>
      replay
        .zoneTimeline(zoneId)
        .filter((assessment) => cursorTimestamp !== null && assessment.timestamp <= cursorTimestamp)
        .map((assessment) => ({
          zoneId,
          timestamp: assessment.timestamp,
          text: businessStoryLine(assessment, parseJustification(assessment.justification)),
        })),
    )
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return (
    <div className="card executive-story-panel">
      <h3>Executive Story</h3>
      {lines.length === 0 ? (
        <p>No events yet at this point in the replay.</p>
      ) : (
        <ul className="executive-story-list">
          {lines.map((line, index) => (
            <li key={`${line.zoneId}-${line.timestamp}-${index}`}>
              <span className="executive-story-time">{formatTimestamp(line.timestamp)}</span>{" "}
              <span className="kpi-sub">{zoneLabel(line.zoneId, zones)}</span> {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
