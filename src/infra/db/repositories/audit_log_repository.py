"""Audit log repository - read-only, M6's addition.

M1 created the ``audit_log`` table only; the docstring on
``src/infra/db/models/audit_log.py`` deliberately left the write side
(the chained-hash tamper-evidence field) undesigned until a milestone
was ready to define the hash-chain algorithm. M6 was explicitly scoped
to the REST API only for this pass - the write side, and the hash
chain it requires, remain deferred to a future milestone. This
repository therefore exposes only what already exists: querying rows.
Nothing here writes an entry, so ``GET /audit`` correctly returns an
empty list until that future milestone adds a writer.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.audit_log import AuditLog


class AuditLogRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, log_id: uuid.UUID) -> AuditLog | None:
        return self._session.get(AuditLog, log_id)

    def list_all(
        self,
        zone_id: uuid.UUID | None,
        event_type: str | None,
        limit: int,
        before: datetime | None,
        after: datetime | None,
    ) -> list[AuditLog]:
        stmt = select(AuditLog)
        if zone_id is not None:
            stmt = stmt.where(AuditLog.zone_id == zone_id)
        if event_type is not None:
            stmt = stmt.where(AuditLog.event_type == event_type)
        if before is not None:
            stmt = stmt.where(AuditLog.timestamp < before)
        if after is not None:
            stmt = stmt.where(AuditLog.timestamp > after)
        stmt = stmt.order_by(AuditLog.timestamp.desc()).limit(limit)
        return list(self._session.scalars(stmt).all())
