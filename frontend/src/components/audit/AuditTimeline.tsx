import type { AuditLogEntry, Zone } from "../../api/types";
import { formatTimestamp, zoneLabel } from "../../lib/format";

export function AuditTimeline({
  entries,
  zones,
}: {
  entries: AuditLogEntry[];
  zones?: Zone[];
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Event</th>
          <th>Actor</th>
          <th>Zone</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.log_id}>
            <td>{formatTimestamp(entry.timestamp)}</td>
            <td>{entry.event_type}</td>
            <td>{entry.actor}</td>
            <td>{entry.zone_id ? zoneLabel(entry.zone_id, zones) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
