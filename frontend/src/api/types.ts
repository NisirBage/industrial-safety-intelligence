/**
 * TypeScript mirrors of the backend's Pydantic response schemas
 * (src/api/schemas/*.py). Field names and types match exactly -
 * this file never adds a computed field the backend doesn't already
 * return, since the dashboard must never calculate risk itself.
 */

export type Tier = "normal" | "watch" | "elevated" | "critical";

export type PermitStatus =
  | "active"
  | "flagged"
  | "suspend_recommended"
  | "closed";

export type AuditEventType =
  | "risk_computed"
  | "permit_flagged"
  | "alert_sent"
  | "action_confirmed";

/** Mirrors src/api/schemas/risk.py::RiskAssessmentResponse. */
export interface RiskAssessment {
  assessment_id: string;
  zone_id: string;
  timestamp: string;
  compound_risk_score: number;
  confidence: number;
  tier: Tier;
  justification: Record<string, unknown>;
}

/** Mirrors src/api/schemas/permits.py::PermitResponse. */
export interface Permit {
  permit_id: string;
  permit_type: string;
  zone_id: string;
  issued_at: string;
  expires_at: string;
  authorizing_officer_id: string;
  status: PermitStatus;
  baseline_snapshot: Record<string, unknown>;
}

/** Mirrors src/api/schemas/audit.py::AuditLogResponse. */
export interface AuditLogEntry {
  log_id: string;
  event_type: AuditEventType | string;
  actor: string;
  zone_id: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** Mirrors src/api/common/pagination.py::PaginatedResponse. */
export interface Paginated<T> {
  items: T[];
  limit: number;
  count: number;
}

/** Mirrors src/api/common/errors.py::ErrorResponse - the one shape
 * every error the backend returns is wrapped in. The frontend never
 * invents its own error format; ApiError below carries this same
 * shape end to end. */
export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}

export interface HistoryQuery {
  [key: string]: string | number | undefined;
  limit?: number;
  before?: string;
  after?: string;
}

export interface PermitsQuery extends HistoryQuery {
  zone_id?: string;
  status?: PermitStatus;
}

export interface AuditQuery extends HistoryQuery {
  zone_id?: string;
  event_type?: string;
}
