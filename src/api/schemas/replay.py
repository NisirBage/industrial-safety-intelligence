"""Request/response schemas for the Time Machine's replay endpoint.

Every field here is either a already-existing `RiskAssessmentResponse`/
`PermitResponse`-shaped value or a pure derivation (a bookmark) over
fields the frozen engine already computed - nothing here is a new
risk, tier, or score computation.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from src.api.schemas.risk import RiskAssessmentResponse


class ReplayBookmarkResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "timestamp": "2026-07-10T09:40:00+00:00",
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "kind": "critical",
                "label": "Reached CRITICAL",
                "assessment_id": "4cab993b-56d9-5c54-aada-e3199aa4c125",
            }
        }
    )

    timestamp: datetime
    zone_id: uuid.UUID
    kind: str = Field(
        description="One of: tier_change, critical, interaction_bonus, permit_activated, "
        "highest_risk."
    )
    label: str
    assessment_id: uuid.UUID | None


class ZoneReplayTimelineResponse(BaseModel):
    zone_id: uuid.UUID
    assessments: list[RiskAssessmentResponse] = Field(
        description="Ascending by timestamp - every persisted RiskAssessment in this zone "
        "within the replay window, unmodified."
    )


class ReplayResponse(BaseModel):
    zone_ids: list[uuid.UUID]
    start_time: datetime
    end_time: datetime
    duration_minutes: float
    tick_count: int = Field(description="Distinct assessment timestamps across every zone.")
    zone_timelines: list[ZoneReplayTimelineResponse]
    bookmarks: list[ReplayBookmarkResponse] = Field(
        description="Sorted by timestamp - auto-detected tier changes, interaction bonuses, "
        "CRITICAL transitions, permit activations, and each zone's highest-risk tick."
    )
