import { apiGet } from "./client";
import type { AuditLogEntry, AuditQuery, Paginated } from "./types";

/** GET /api/v1/audit - optionally filtered by zone and/or event type.
 * Expect an empty list today: the backend's hash-chained audit-log
 * writer was explicitly deferred at M6, so nothing writes an entry
 * yet (see src/infra/db/repositories/audit_log_repository.py's own
 * docstring) - a confirmed-empty state, not a frontend bug. */
export function getAuditLog(query: AuditQuery = {}): Promise<Paginated<AuditLogEntry>> {
  return apiGet<Paginated<AuditLogEntry>>("/api/v1/audit", query);
}
