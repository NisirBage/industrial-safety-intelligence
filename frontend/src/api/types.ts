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

/** Mirrors src/api/schemas/zones.py::ZoneResponse (Decision Intelligence Layer). */
export interface Zone {
  zone_id: string;
  name: string;
  plant_section: string;
  oisd_area_classification: string;
}

/** Mirrors src/api/schemas/zones.py::ZoneWorkerCountResponse (Presentation Layer). */
export interface ZoneWorkerCount {
  zone_id: string;
  worker_count: number;
}

/** Mirrors src/api/schemas/scenarios.py::ScenarioSummaryResponse. */
export interface ScenarioSummary {
  key: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  zone_ids: string[];
  seed: number;
}

/** Mirrors src/api/schemas/counterfactual.py::CounterfactualComparisonResponse. */
export interface CounterfactualVerdict {
  alert: boolean;
  triggered_sensors: string[];
  highest_ratio: number | null;
}

export interface CompoundVerdict {
  compound_risk_score: number;
  confidence: number;
  tier: Tier;
}

export interface CounterfactualComparison {
  zone_id: string;
  timestamp: string;
  counterfactual: CounterfactualVerdict;
  compound: CompoundVerdict | null;
}

/** Mirrors src/api/schemas/workers.py::WorkerResponse (Scenario Builder). */
export interface Worker {
  worker_id: string;
  role: string;
  current_zone_id: string | null;
}

/** Mirrors src/api/schemas/sensors.py::SensorResponse (Scenario Builder). */
export interface SensorInfo {
  sensor_id: string;
  zone_id: string;
  gas_type: string;
  alarm_threshold: number;
  last_calibrated_at: string | null;
}

/** Mirrors src/api/schemas/equipment.py::EquipmentResponse (Scenario Builder,
 * read-only - equipment has no scenario-event concept). */
export interface EquipmentInfo {
  equipment_id: string;
  zone_id: string;
  equipment_type: string;
  isolation_status: string;
  maintenance_flag: boolean;
  loto_confirmed: boolean;
}

/** Mirrors src/api/schemas/scenario_builder.py::ScenarioBuilderOptionsResponse. */
export interface CurveInfo {
  name: string;
  required_params: string[];
}

export interface ScenarioBuilderOptions {
  curves: CurveInfo[];
  permit_types: string[];
  gas_types: string[];
}

/** Mirrors src/api/schemas/scenario_builder.py::SensorEventInput. */
export interface SensorEventDraft {
  name: string;
  zone_id: string;
  gas_type: string;
  sim_time: number;
  duration_minutes: number;
  sample_interval_minutes: number;
  curve: string;
  params: Record<string, number>;
}

/** Mirrors src/api/schemas/scenario_builder.py::PermitEventInput. */
export interface PermitEventDraft {
  name: string;
  zone_id: string;
  sim_time: number;
  permit_type: string;
  authorizing_officer_id: string;
  duration_minutes: number;
}

/** Mirrors src/api/schemas/scenario_builder.py::ScenarioDefinitionInput. */
export interface ScenarioDefinitionDraft {
  title: string;
  description: string;
  seed: number;
  start_time: string;
  sensor_events: SensorEventDraft[];
  permit_events: PermitEventDraft[];
}

/** Mirrors src/api/schemas/scenario_builder.py::ScenarioValidationResponse. */
export interface ScenarioValidationResult {
  valid: boolean;
  errors: string[];
}

/** Mirrors src/api/schemas/scenario_builder.py::ZoneScenarioResultResponse. */
export interface ZoneScenarioResult {
  zone_id: string;
  tick_count: number;
  final_tier: Tier;
  final_score: number;
  assessment_ids: string[];
}

/** Mirrors src/api/schemas/scenario_builder.py::ScenarioExecutionResponse. */
export interface ScenarioExecutionResult {
  valid: boolean;
  errors: string[];
  start_time: string | null;
  end_time: string | null;
  zone_results: ZoneScenarioResult[];
}

/** Mirrors src/api/schemas/replay.py::ReplayBookmarkResponse (Time Machine). */
export interface ReplayBookmark {
  timestamp: string;
  zone_id: string;
  kind: "tier_change" | "critical" | "interaction_bonus" | "permit_activated" | "highest_risk";
  label: string;
  assessment_id: string | null;
}

/** Mirrors src/api/schemas/replay.py::ZoneReplayTimelineResponse. */
export interface ZoneReplayTimeline {
  zone_id: string;
  assessments: RiskAssessment[];
}

/** Mirrors src/api/schemas/replay.py::ReplayResponse. */
export interface ReplayData {
  zone_ids: string[];
  start_time: string;
  end_time: string;
  duration_minutes: number;
  tick_count: number;
  zone_timelines: ZoneReplayTimeline[];
  bookmarks: ReplayBookmark[];
}
