import { useState } from "react";

import { useReplay } from "../../context/ReplayContext";
import { formatTimestamp, zoneLabel } from "../../lib/format";
import { useZones } from "../../hooks/useZones";

const KIND_LABELS: Record<string, string> = {
  tier_change: "Tier change",
  critical: "Reached CRITICAL",
  interaction_bonus: "Interaction bonus",
  permit_activated: "Permit activated",
  highest_risk: "Highest risk",
};

/**
 * Item 6 (Replay Bookmarks) - server-detected bookmarks (tier
 * changes, interaction bonuses, CRITICAL transitions, permit
 * activations, each zone's highest-risk tick - all computed by
 * `GET /replay`, never re-derived here) plus user-created custom
 * bookmarks, which are client-only for this milestone (not persisted
 * across a reload - see docs/architecture/time_machine.md's Known
 * Limitations). Clicking any bookmark jumps the shared replay cursor.
 */
export function BookmarksPanel() {
  const replay = useReplay();
  const { data: zones } = useZones();
  const [label, setLabel] = useState("");

  const allBookmarks = [
    ...replay.bookmarks.map((b) => ({
      id: `${b.kind}-${b.zone_id}-${b.timestamp}`,
      timestamp: b.timestamp,
      label: `${KIND_LABELS[b.kind] ?? b.kind} - ${zoneLabel(b.zone_id, zones)}: ${b.label}`,
      custom: false,
    })),
    ...replay.customBookmarks.map((b) => ({
      id: b.id,
      timestamp: b.timestamp,
      label: `★ ${b.label}`,
      custom: true,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="card replay-bookmarks">
      <h3>Bookmarks</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (label.trim()) {
            replay.addCustomBookmark(label.trim());
            setLabel("");
          }
        }}
      >
        <input
          type="text"
          placeholder="Bookmark this tick as…"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <button type="submit">Add bookmark</button>
      </form>
      {allBookmarks.length === 0 ? (
        <p>No bookmarks yet.</p>
      ) : (
        <ul className="replay-bookmark-list">
          {allBookmarks.map((bookmark) => (
            <li key={bookmark.id}>
              <button
                type="button"
                className="replay-bookmark-item"
                onClick={() => replay.jumpToTimestamp(bookmark.timestamp)}
              >
                <span>{formatTimestamp(bookmark.timestamp)}</span>
                <span>{bookmark.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
