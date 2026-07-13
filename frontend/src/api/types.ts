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

/** Mirrors src/api/schemas/historical.py::HistoricalIncidentSummary (M24). */
export interface HistoricalIncidentSummary {
  scenario_key: string;
  root_cause: string;
  business_impact: string;
  operational_impact: string;
  safety_impact: string;
}

/** Mirrors src/api/schemas/historical.py::HistoricalDeckResponse. */
export interface HistoricalDeck {
  key: string;
  name: string;
  description: string;
  incidents: HistoricalIncidentSummary[];
}

/** Mirrors src/api/schemas/historical.py::LessonResponse. */
export interface HistoricalLesson {
  rule: string;
  lesson: string;
}

/** Mirrors src/api/schemas/historical.py::IncidentMatchResponse - one
 * past incident similar to the current assessment. Never a
 * recommendation of its own - context only (matching/differing
 * features, real outcome, lessons learned, and the exact evidence
 * this was computed from). */
export interface IncidentMatch {
  scenario_key: string;
  incident_name: string;
  date: string;
  zone_id: string;
  similarity: number;
  outcome_tier: Tier;
  root_cause: string;
  business_impact: string;
  operational_impact: string;
  safety_impact: string;
  matching_features: string[];
  differing_features: string[];
  lessons_learned: HistoricalLesson[];
  evidence_source: string;
}

/** Mirrors src/api/schemas/historical.py::IncidentMatchesResponse. */
export interface IncidentMatchesResult {
  zone_id: string;
  timestamp: string;
  matches: IncidentMatch[];
}

/** Mirrors src/api/schemas/historical.py::RuleFrequencyResponse. */
export interface RuleFrequency {
  rule: string;
  lesson: string;
  incident_count: number;
}

/** Mirrors src/api/schemas/historical.py::UnavailableResponse - the
 * honest "Status: Unavailable - Reason: ..." pattern, used where this
 * platform has no real data to answer with rather than a fabricated
 * value (see src/historical/analytics.py). */
export interface HistoricalUnavailable {
  reason: string;
}

/** Mirrors src/api/schemas/historical.py::CrossScenarioAnalyticsResponse. */
export interface CrossScenarioAnalytics {
  total_incidents: number;
  total_indexed_ticks: number;
  most_common_causes: RuleFrequency[];
  most_common_equipment_issues: RuleFrequency[];
  most_common_permit_conflicts: RuleFrequency[];
  most_common_worker_hazards: RuleFrequency[];
  average_resolution_minutes: number | null;
  most_effective_interventions: HistoricalUnavailable;
  industry_comparisons: HistoricalUnavailable;
}

/** Mirrors src/api/schemas/foresight.py::MatchSummaryResponse (M25). */
export interface ForesightMatchSummary {
  scenario_key: string;
  incident_name: string;
  zone_id: string;
  anchor_timestamp: string;
  similarity: number;
  window_length: number;
}

/** Mirrors src/api/schemas/foresight.py::ForecastEvidenceResponse - the
 * real historical observation every projected point must cite. */
export interface ForecastEvidence {
  scenario_key: string;
  zone_id: string;
  similarity: number;
  observed_risk: number;
  observed_tier: Tier;
  observed_timestamp: string;
  minutes_after_anchor: number;
}

/** Mirrors src/api/schemas/foresight.py::ForecastPointResponse. A
 * `null` projected_risk/projected_tier means this horizon is honestly
 * unavailable (see `unavailable_reason`), never interpolated. */
export interface ForecastPoint {
  horizon_minutes: number;
  projected_risk: number | null;
  projected_tier: Tier | null;
  evidence: ForecastEvidence[];
  unavailable_reason: string | null;
}

/** Mirrors src/api/schemas/foresight.py::ForesightConfidenceResponse -
 * `overall` is the minimum of the four factors, never an average. */
export interface ForesightConfidence {
  historical_agreement: number;
  data_completeness: number;
  trajectory_similarity: number;
  replay_coverage: number;
  overall: number;
}

/** Mirrors src/api/schemas/foresight.py::ProgressionStageResponse. */
export interface ProgressionStage {
  label: string;
  tier: Tier | null;
  supporting_matches: number;
  total_matches: number;
  evidence: string;
}

/** Mirrors src/api/schemas/foresight.py::IncidentProgressionResponse. */
export interface IncidentProgression {
  current_stage: ProgressionStage;
  likely_next_stage: ProgressionStage;
  likely_following_stage: ProgressionStage;
  expected_resolution: ProgressionStage;
}

/** Mirrors src/api/schemas/foresight.py::EarlyWarningSignalResponse -
 * `category` is always one of the four the milestone specifies. */
export interface EarlyWarningSignal {
  category: "Potential Escalation" | "Potential Stabilization" | "Potential Recovery" | "Potential Shutdown";
  why: string;
  supporting_matches: number;
  total_matches: number;
}

/** Mirrors src/api/schemas/foresight.py::DeckContributionResponse. */
export interface DeckContribution {
  deck_key: string;
  deck_name: string;
  matched_incident_count: number;
}

/** Mirrors src/api/schemas/foresight.py::ForesightResponse - the full
 * Operational Foresight result for one zone/tick. Every field here is
 * context/trend evidence, never a recommendation of its own - the
 * deterministic engine's own RecommendationList remains authoritative. */
export interface ForesightResult {
  zone_id: string;
  timestamp: string;
  current_risk_score: number;
  current_tier: Tier;
  window_size: number;
  current_window_length: number;
  matches: ForesightMatchSummary[];
  forecast: ForecastPoint[];
  confidence: ForesightConfidence;
  progression: IncidentProgression;
  early_warning: EarlyWarningSignal;
  deck_contributions: DeckContribution[];
}

/** M26 - Operational Knowledge Graph. Mirrors
 * src/api/schemas/graph.py exactly. `kind` is one of the 15 real
 * entity kinds (`src/knowledge_graph/entities.py::EntityKind`);
 * `attributes` holds only values already computed elsewhere in this
 * platform - the graph never derives a new one. */
export type GraphEntityKind =
  | "plant"
  | "zone"
  | "sensor"
  | "sensor_reading"
  | "worker"
  | "equipment"
  | "permit"
  | "risk_assessment"
  | "triggered_agent"
  | "recommendation"
  | "historical_incident"
  | "forecast"
  | "lesson_learned"
  | "counterfactual"
  | "business_impact";

/** Mirrors src/api/schemas/graph.py::GraphEntityResponse. */
export interface GraphEntity {
  kind: GraphEntityKind;
  id: string;
  label: string;
  attributes: Record<string, unknown>;
}

/** Mirrors src/api/schemas/graph.py::GraphEdgeResponse - `relation` is
 * one of `src/knowledge_graph/relationships.py::RelationKind`'s real,
 * documented relationship kinds (never a fabricated connection). */
export interface GraphEdge {
  source_kind: GraphEntityKind;
  source_id: string;
  relation: string;
  target_kind: GraphEntityKind;
  target_id: string;
  label: string;
}

/** Mirrors src/api/schemas/graph.py::NeighborResponse. */
export interface GraphNeighbor {
  edge: GraphEdge;
  entity: GraphEntity;
}

/** Mirrors src/api/schemas/graph.py::NeighborsResponse. */
export interface GraphNeighbors {
  entity: GraphEntity;
  neighbors: GraphNeighbor[];
}

/** Mirrors src/api/schemas/graph.py::SubgraphResponse - a bounded,
 * lazy-loaded neighborhood, never the whole graph. */
export interface GraphSubgraph {
  nodes: GraphEntity[];
  edges: GraphEdge[];
}

/** Mirrors src/api/schemas/graph.py::SearchResponse. */
export interface GraphSearchResult {
  query: string;
  results: GraphEntity[];
}

/** Mirrors src/api/schemas/graph.py::PathResponse - `found: false` is
 * not an error, it means no path exists within the requested depth. */
export interface GraphPath {
  found: boolean;
  edges: GraphEdge[];
}

/** M27 Part 1 (Compliance & Standards) - mirrors src/api/schemas/compliance.py. */
export interface StandardReferenceResponse {
  code: string;
  title: string;
  summary: string;
  applicability: string;
  external_reference: string;
}

export interface ComplianceStandardsResponse {
  recommendation_id: string;
  standards: StandardReferenceResponse[];
}

/** M27 Part 4 (Live Data Connectors) - mirrors src/api/schemas/ingest.py. */
export interface IngestReadingResponse {
  reading_id: string;
  sensor_id: string;
  zone_id: string;
  gas_type: string;
  value: number;
  unit: string;
  timestamp: string;
  quality_flag: string;
}

export interface ConnectorStatus {
  name: string;
  protocol: string;
  mode: "implemented" | "mock";
  description: string;
  readings_ingested_this_process: number;
}

export interface ConnectorStatusResponse {
  connectors: ConnectorStatus[];
}

/** M27 Part 6 (Enterprise Health Dashboard) - mirrors
 * src/api/schemas/platform_health.py. */
export interface SubsystemCheck {
  name: string;
  status: "ok" | "degraded" | "error";
  detail: string;
}

export interface PlatformHealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  latency_ms: number;
  checks: SubsystemCheck[];
}
