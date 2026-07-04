"""Response schema for the scenario catalog (Decision Intelligence Layer)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ScenarioSummaryResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "key": "demo_vizag_clairton",
                "title": "Vizag-Clairton Demo Incident",
                "description": "Hot work permit issued in Tank Farm while CO rises in "
                "Compressor House and CH4 rises in Tank Farm.",
                "start_time": "2026-07-01T08:00:00+00:00",
                "end_time": "2026-07-01T08:30:00+00:00",
                "zone_ids": ["e154bed9-d1dd-5dec-9736-26112bc04edf"],
                "seed": 42,
            }
        }
    )

    key: str = Field(description="The scenario file's stem - stable identifier for this catalog.")
    title: str
    description: str
    start_time: datetime = Field(description="Scenario's own start_time.")
    end_time: datetime = Field(
        description="Latest (event start + duration) across every event in the scenario."
    )
    zone_ids: list[uuid.UUID] = Field(description="Every zone this scenario's events touch.")
    seed: int
