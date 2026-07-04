"""Response schema for ``Permit`` rows."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_EXAMPLE: dict[str, Any] = {
    "permit_id": "7ff2d41a-ba79-50dd-b993-d544915736ab",
    "permit_type": "hot_work",
    "zone_id": "52b30591-0bfa-5faf-8849-2ee43ed4557b",
    "issued_at": "2026-07-01T13:35:00+05:30",
    "expires_at": "2026-07-01T21:35:00+05:30",
    "authorizing_officer_id": "6ae6d6cb-6950-5771-abb3-f83588ddb54d",
    "status": "active",
    "baseline_snapshot": {
        "schema_version": 1,
        "algorithm_version": 1,
        "gas_risk_at_issuance": 40.0,
        "confidence_at_issuance": 0.1,
        "captured_at": "2026-07-01T08:05:00+00:00",
    },
}


class PermitResponse(BaseModel):
    """One ``Permit`` row. ``status`` reflects Permit Intelligence's
    already-applied decision (active/flagged/suspend_recommended/
    closed) - this schema never re-derives it."""

    model_config = ConfigDict(from_attributes=True, json_schema_extra={"example": _EXAMPLE})

    permit_id: uuid.UUID
    permit_type: str = Field(description='e.g. "hot_work".')
    zone_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime
    authorizing_officer_id: uuid.UUID = Field(description="A Worker.worker_id.")
    status: str = Field(description="One of: active, flagged, suspend_recommended, closed.")
    baseline_snapshot: dict[str, object] = Field(
        description="Gas Risk score/confidence captured at issuance time, computed by Gas "
        "Risk's own frozen calculate_risk/calculate_confidence - used by Permit Intelligence "
        "to detect drift since issuance, never recomputed by this API."
    )
