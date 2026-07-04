"""Response schema for ``AuditLog`` rows."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AuditLogResponse(BaseModel):
    """One ``AuditLog`` row. No writer exists yet (see
    ``src/infra/db/repositories/audit_log_repository.py``), so
    ``GET /audit`` always returns an empty list of these today - a
    confirmed-empty response, not a broken endpoint."""

    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    event_type: str = Field(
        description="One of: risk_computed, permit_flagged, alert_sent, action_confirmed."
    )
    actor: str = Field(description='e.g. "system" or a worker identifier.')
    zone_id: uuid.UUID | None = Field(description="Null for plant-wide events.")
    payload: dict[str, object] = Field(
        description="Event-specific detail, shape varies by event_type."
    )
    timestamp: datetime
