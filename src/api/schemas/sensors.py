"""Response schema for ``Sensor`` rows.

Added for the Scenario Builder: a user picking a zone needs to know
which gas type(s) it actually monitors before authoring a sensor
event - a scenario event naming a zone/gas-type pair with no matching
sensor fails ``validate_references`` (frozen, ``src/domain/simulation/
scenario.py`` via ``src/services/simulation_runner.py``) with an
opaque error; this endpoint lets the builder never construct that
combination in the first place.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SensorResponse(BaseModel):
    """One ``Sensor`` row - plant metadata only, never a reading."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "sensor_id": "9c6f3e0a-3f7b-5b8b-9a9f-1f6b6f6b6f6b",
                "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
                "gas_type": "CH4",
                "alarm_threshold": 10.0,
                "last_calibrated_at": "2026-06-01T00:00:00+00:00",
            }
        },
    )

    sensor_id: uuid.UUID
    zone_id: uuid.UUID
    gas_type: str = Field(description="One of: CO, H2S, CH4, O2, COG_pressure, BFG_pressure.")
    alarm_threshold: float
    last_calibrated_at: datetime | None = None
