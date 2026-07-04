"""Request/response schemas for the Scenario Builder.

`ScenarioDefinitionInput` mirrors the frozen `Scenario`/`SensorEvent`/
`PermitEvent` shape (`src/domain/simulation/scenario.py`) field-for-
field, except `zone`/`authorizing_officer` are real UUIDs of
already-existing plant entities (picked from `GET /zones`,
`GET /workers`) rather than YAML-authored semantic keys - see
`src/services/scenario_builder.py`'s module docstring for the full
reasoning.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SensorEventInput(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "tank_farm_ch4_rise",
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "gas_type": "CH4",
                "sim_time": 0,
                "duration_minutes": 60,
                "sample_interval_minutes": 5,
                "curve": "linear_ramp",
                "params": {"start_value": 2, "slope": 0.35},
            }
        }
    )

    name: str
    zone_id: uuid.UUID
    gas_type: str
    sim_time: float = Field(ge=0)
    duration_minutes: float = Field(gt=0)
    sample_interval_minutes: float = Field(gt=0, default=1.0)
    curve: str
    params: dict[str, float]


class PermitEventInput(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "hotwork_during_rise",
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "sim_time": 10,
                "permit_type": "hot_work",
                "authorizing_officer_id": "6ae6d6cb-6950-5771-abb3-f83588ddb54d",
                "duration_minutes": 480,
            }
        }
    )

    name: str
    zone_id: uuid.UUID
    sim_time: float = Field(ge=0)
    permit_type: str
    authorizing_officer_id: uuid.UUID
    duration_minutes: float = Field(gt=0)


class ScenarioDefinitionInput(BaseModel):
    title: str = ""
    description: str = ""
    seed: int
    start_time: datetime
    sensor_events: list[SensorEventInput] = Field(default_factory=list)
    permit_events: list[PermitEventInput] = Field(default_factory=list)


class ScenarioValidationResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)


class ZoneScenarioResultResponse(BaseModel):
    zone_id: uuid.UUID
    tick_count: int
    final_tier: str
    final_score: float
    assessment_ids: list[uuid.UUID]


class ScenarioExecutionResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    start_time: datetime | None = None
    end_time: datetime | None = None
    zone_results: list[ZoneScenarioResultResponse] = Field(default_factory=list)


class CurveInfo(BaseModel):
    name: str
    required_params: list[str]


class ScenarioBuilderOptionsResponse(BaseModel):
    """Reference data so the frontend never hardcodes a second copy of
    domain constants it doesn't own - every value here is read
    straight from the frozen `CURVE_REGISTRY`/`CURVE_REQUIRED_PARAMS`
    and the `PERMIT_TYPES`/`GAS_TYPES` model-level enums."""

    curves: list[CurveInfo]
    permit_types: list[str]
    gas_types: list[str]
