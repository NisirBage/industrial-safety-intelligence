"""Response schema for ``RiskAssessment`` rows."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RiskAssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    assessment_id: uuid.UUID
    zone_id: uuid.UUID
    timestamp: datetime
    compound_risk_score: float
    confidence: float
    tier: str
    justification: dict[str, object]
