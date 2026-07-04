"""Response schema for ``Worker`` rows.

Added for the Scenario Builder's authorizing-officer picker - the
first time a worker list (rather than just a per-zone count, M11.0)
is exposed via REST.
"""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class WorkerResponse(BaseModel):
    """One ``Worker`` row - plant metadata only, never a risk value."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "worker_id": "6ae6d6cb-6950-5771-abb3-f83588ddb54d",
                "role": "safety_officer",
                "current_zone_id": "d511949a-5f80-5804-bff2-46223f0d83d5",
            }
        },
    )

    worker_id: uuid.UUID
    role: str = Field(
        description="One of: operator, supervisor, safety_officer, contractor, auditor."
    )
    current_zone_id: uuid.UUID | None = Field(
        description="Current position from the location feed; null if unassigned."
    )
