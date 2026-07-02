"""Response schema for ``AuditLog`` rows."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: uuid.UUID
    event_type: str
    actor: str
    zone_id: uuid.UUID | None
    payload: dict[str, object]
    timestamp: datetime
