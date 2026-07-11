"""Request/response schemas for the Historical Intelligence API (M24).

Every field here reshapes either an authored `HistoricalIncident`/
`HistoricalDeck` (static, real metadata - see `src/historical/decks.py`)
or a computed `IncidentMatch`/`CrossScenarioAnalytics` value (see
`src/historical/knowledge_base.py` and `src/historical/analytics.py`) -
nothing here is a new computation, only a response shape.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class HistoricalIncidentSummary(BaseModel):
    scenario_key: str
    root_cause: str
    business_impact: str
    operational_impact: str
    safety_impact: str


class HistoricalDeckResponse(BaseModel):
    key: str
    name: str
    description: str
    incidents: list[HistoricalIncidentSummary]


class LessonResponse(BaseModel):
    rule: str
    lesson: str


class IncidentMatchResponse(BaseModel):
    scenario_key: str
    incident_name: str
    date: datetime
    zone_id: uuid.UUID
    similarity: float = Field(ge=0, le=1, description="0 (nothing alike) to 1 (identical).")
    outcome_tier: str = Field(description="Worst tier this zone reached across the whole incident.")
    root_cause: str
    business_impact: str
    operational_impact: str
    safety_impact: str
    matching_features: list[str]
    differing_features: list[str]
    lessons_learned: list[LessonResponse]
    evidence_source: str = Field(
        description="Exact scenario/timestamp/assessment_id this match was computed against, "
        "for audit."
    )


class IncidentMatchesResponse(BaseModel):
    zone_id: uuid.UUID
    timestamp: datetime
    matches: list[IncidentMatchResponse]


class RuleFrequencyResponse(BaseModel):
    rule: str
    lesson: str
    incident_count: int


class UnavailableResponse(BaseModel):
    reason: str


class CrossScenarioAnalyticsResponse(BaseModel):
    total_incidents: int
    total_indexed_ticks: int
    most_common_causes: list[RuleFrequencyResponse]
    most_common_equipment_issues: list[RuleFrequencyResponse]
    most_common_permit_conflicts: list[RuleFrequencyResponse]
    most_common_worker_hazards: list[RuleFrequencyResponse]
    average_resolution_minutes: float | None
    most_effective_interventions: UnavailableResponse
    industry_comparisons: UnavailableResponse
