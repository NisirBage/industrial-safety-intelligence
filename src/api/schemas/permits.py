"""Response schema for ``Permit`` rows."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PermitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    permit_id: uuid.UUID
    permit_type: str
    zone_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime
    authorizing_officer_id: uuid.UUID
    status: str
    baseline_snapshot: dict[str, object]
