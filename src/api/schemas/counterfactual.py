"""Response schema for a Counterfactual comparison (Decision Intelligence Layer).

Pairs the frozen Counterfactual Comparator's own verdict for a
zone/tick with the compound engine's persisted verdict for the same
tick, if one exists - side-by-side by construction, never merged into
one number, since that is the entire point of an independent
baseline.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CounterfactualVerdict(BaseModel):
    """Directly ``src.domain.orchestrator.counterfactual.CounterfactualResult``,
    reshaped - every field copied, none recomputed."""

    alert: bool = Field(description="True if any single sensor crossed its own alarm threshold.")
    triggered_sensors: list[str] = Field(description="Sensor ids that individually alerted.")
    highest_ratio: float | None = Field(
        description="Largest value/threshold ratio seen this tick, diagnostic only."
    )


class CompoundVerdict(BaseModel):
    """The compound engine's persisted verdict for the same zone/tick,
    when one exists - omitted (null) if this exact tick was never
    persisted, never approximated from a nearby tick."""

    compound_risk_score: float
    confidence: float
    tier: str


class CounterfactualComparisonResponse(BaseModel):
    zone_id: uuid.UUID
    timestamp: datetime
    counterfactual: CounterfactualVerdict
    compound: CompoundVerdict | None = Field(
        description="Null if no RiskAssessment was persisted for this exact zone/timestamp."
    )
