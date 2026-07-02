import type { AuditLogEntry } from "../../api/types";
import { formatTimestamp, shortZoneLabel } from "../../lib/format";

export function AuditTimeline({ entries }: { entries: AuditLogEntry[] }) {
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
            <td>{entry.zone_id ? shortZoneLabel(entry.zone_id) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
