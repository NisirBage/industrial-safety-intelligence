import { useState } from "react";

import type { AuditEventType } from "../api/types";
import { AuditTimeline } from "../components/audit/AuditTimeline";
import { QueryResult } from "../components/common/QueryResult";
import { useAuditLog } from "../hooks/useAuditLog";

const EVENT_TYPES: AuditEventType[] = [
  "risk_computed",
  "permit_flagged",
  "alert_sent",
  "action_confirmed",
];
const PAGE_SIZE = 25;

export function AuditPage() {
  const [eventType, setEventType] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const before = cursorStack[cursorStack.length - 1];

  const { data, isLoading, error } = useAuditLog({
    event_type: eventType,
    before,
    limit: PAGE_SIZE,
  });
  const items = data?.items ?? [];
  const oldest = items[items.length - 1];

  return (
    <section>
      <h1>Audit Log</h1>
      <div className="filters">
        <label>
          Event type:{" "}
          <select
            value={eventType ?? ""}
            onChange={(event) => {
              setEventType(event.target.value || undefined);
              setCursorStack([undefined]);
            }}
          >
            <option value="">All events</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyLabel="No audit log entries yet - the hash-chained writer is deferred; see docs/frontend/known-limitations.md."
      >
        <AuditTimeline entries={items} />
        <div className="pagination-controls">
          <button
            type="button"
            disabled={cursorStack.length === 1}
            onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
          >
            Newer
          </button>
          <button
            type="button"
            disabled={items.length < PAGE_SIZE || !oldest}
            onClick={() => {
              if (oldest) {
                setCursorStack((stack) => [...stack, oldest.timestamp]);
              }
            }}
          >
            Older
          </button>
        </div>
      </QueryResult>
    </section>
  );
}
