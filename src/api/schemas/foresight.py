"""Request/response schemas for the Operational Foresight API (M25).

Every field reshapes a `src/foresight/*` dataclass exactly - nothing
here is a new computation, only a response shape. Per this milestone's
architectural principle, this schema module never adds a
"recommendation" field of its own: forecast points, progression
stages, and the early-warning signal all carry an explicit evidence
citation (matched incidents, similarity, counts) so the frontend can
never render one of these as if it were an authoritative persisted
`RiskAssessment` row.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class MatchSummaryResponse(BaseModel):
    scenario_key: str
    incident_name: str
    zone_id: uuid.UUID
    anchor_timestamp: datetime
    similarity: float = Field(ge=0, le=1)
    window_length: int


class ForecastEvidenceResponse(BaseModel):
    scenario_key: str
    zone_id: uuid.UUID
    similarity: float = Field(ge=0, le=1)
    observed_risk: float
    observed_tier: str
    observed_timestamp: datetime
    minutes_after_anchor: float


class ForecastPointResponse(BaseModel):
    horizon_minutes: int
    projected_risk: float | None
    projected_tier: str | None
    evidence: list[ForecastEvidenceResponse]
    unavailable_reason: str | None


class ForesightConfidenceResponse(BaseModel):
    historical_agreement: float = Field(ge=0, le=1)
    data_completeness: float = Field(ge=0, le=1)
    trajectory_similarity: float = Field(ge=0, le=1)
    replay_coverage: float = Field(ge=0, le=1)
    overall: float = Field(ge=0, le=1)


class ProgressionStageResponse(BaseModel):
    label: str
    tier: str | None
    supporting_matches: int
    total_matches: int
    evidence: str


class IncidentProgressionResponse(BaseModel):
    current_stage: ProgressionStageResponse
    likely_next_stage: ProgressionStageResponse
    likely_following_stage: ProgressionStageResponse
    expected_resolution: ProgressionStageResponse


class EarlyWarningSignalResponse(BaseModel):
    category: str
    why: str
    supporting_matches: int
    total_matches: int


class DeckContributionResponse(BaseModel):
    deck_key: str
    deck_name: str
    matched_incident_count: int


class ForesightResponse(BaseModel):
    zone_id: uuid.UUID
    timestamp: datetime
    current_risk_score: float
    current_tier: str
    window_size: int
    current_window_length: int
    matches: list[MatchSummaryResponse]
    forecast: list[ForecastPointResponse]
    confidence: ForesightConfidenceResponse
    progression: IncidentProgressionResponse
    early_warning: EarlyWarningSignalResponse
    deck_contributions: list[DeckContributionResponse]
