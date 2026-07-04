"""Response schema for ``RiskAssessment`` rows."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_EXAMPLE: dict[str, Any] = {
    "assessment_id": "e2f123ef-ef59-56cd-88de-9c88206b7dba",
    "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
    "timestamp": "2026-07-01T14:10:00+05:30",
    "compound_risk_score": 41.2014803528676,
    "confidence": 0.3,
    "tier": "normal",
    "justification": {
        "schema_version": 1,
        "rules_fired": ["saturating_threshold_function", "weighted_sum_fusion"],
        "agent_contributions": {"gas_risk": {"risk": 54.82, "confidence": 0.3}},
        "interaction_bonus_applied": 1.4,
        "tier_before": "normal",
        "tier_after": "normal",
    },
}


class RiskAssessmentResponse(BaseModel):
    """One persisted ``RiskAssessment`` row, unchanged from what the
    frozen Risk Pipeline wrote - this schema reshapes nothing."""

    model_config = ConfigDict(from_attributes=True, json_schema_extra={"example": _EXAMPLE})

    assessment_id: uuid.UUID = Field(
        description="Deterministic UUIDv5, derived from (zone_id, timestamp) - re-running the "
        "same tick overwrites this exact row rather than creating a duplicate."
    )
    zone_id: uuid.UUID
    timestamp: datetime = Field(description="Simulated tick time, never a wall-clock timestamp.")
    compound_risk_score: float = Field(ge=0, le=100, description="0-100 scale.")
    confidence: float = Field(
        ge=0, le=1, description="0-1 scale; minimum across contributing agents."
    )
    tier: str = Field(description="One of: normal, watch, elevated, critical.")
    justification: dict[str, object] = Field(
        description="Frozen RiskAssessmentJustification shape - rules fired, per-agent "
        "contributions, interaction bonus, and the tier transition. See "
        "docs/architecture/CORE_FREEZE.md for the exact, frozen schema."
    )
