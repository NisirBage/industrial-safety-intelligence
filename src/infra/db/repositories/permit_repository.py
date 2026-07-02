"""Permit repository.

M1 provided only the minimal lookup/create surface. M4B adds
``update_status`` - the Master Plan's own M4 task 3 assigns this
module the job of persisting Permit Intelligence's decisions "with
baseline_snapshot JSONB written at issuance and never mutated
afterward, only compared against." ``update_status`` mutates the
fetched ORM instance's ``status`` attribute directly rather than
merging a reconstructed object, specifically so no other column -
especially ``baseline_snapshot`` - can ever be touched by this call.

``list_open_by_zone`` is the System Integration Layer's addition
(Phase 0, Context Builder Design): both a zone's own Permit
Intelligence context and the SIMOPS check against each adjacent
zone's permit types need "every non-closed permit in a zone." Filters
at the query level rather than relying solely on
``PermitIntelligenceAgent``'s own internal ``status != "closed"``
filter (which still applies redundantly and harmlessly) - so callers
that only need SIMOPS-relevant permit types never fetch closed ones
either.

``list_all`` is M6's addition - the read path behind ``GET /permits``,
returning permits of *any* status (unlike ``list_open_by_zone``),
optionally filtered by zone and/or status, paginated by ``issued_at``.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.permit import Permit


class PermitRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, permit_id: uuid.UUID) -> Permit | None:
        return self._session.get(Permit, permit_id)

    def list_open_by_zone(self, zone_id: uuid.UUID) -> list[Permit]:
        stmt = select(Permit).where(Permit.zone_id == zone_id, Permit.status != "closed")
        return list(self._session.scalars(stmt).all())

    def list_all(
        self,
        zone_id: uuid.UUID | None,
        status: str | None,
        limit: int,
        before: datetime | None,
        after: datetime | None,
    ) -> list[Permit]:
        stmt = select(Permit)
        if zone_id is not None:
            stmt = stmt.where(Permit.zone_id == zone_id)
        if status is not None:
            stmt = stmt.where(Permit.status == status)
        if before is not None:
            stmt = stmt.where(Permit.issued_at < before)
        if after is not None:
            stmt = stmt.where(Permit.issued_at > after)
        stmt = stmt.order_by(Permit.issued_at.desc()).limit(limit)
        return list(self._session.scalars(stmt).all())

    def create(self, permit: Permit) -> Permit:
        merged = self._session.merge(permit)
        self._session.flush()
        return merged

    def update_status(self, permit_id: uuid.UUID, new_status: str) -> Permit:
        """Updates only ``status``. Raises if the permit doesn't exist -
        that's a caller bug, not a degraded-data case."""
        permit = self._session.get(Permit, permit_id)
        if permit is None:
            raise ValueError(f"no permit found for id {permit_id!r}")
        permit.status = new_status
        self._session.flush()
        return permit
