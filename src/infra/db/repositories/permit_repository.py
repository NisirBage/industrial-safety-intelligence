"""Permit repository.

M1 provided only the minimal lookup/create surface. M4B adds
``update_status`` - the Master Plan's own M4 task 3 assigns this
module the job of persisting Permit Intelligence's decisions "with
baseline_snapshot JSONB written at issuance and never mutated
afterward, only compared against." ``update_status`` mutates the
fetched ORM instance's ``status`` attribute directly rather than
merging a reconstructed object, specifically so no other column -
especially ``baseline_snapshot`` - can ever be touched by this call.
"""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.permit import Permit


class PermitRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, permit_id: uuid.UUID) -> Permit | None:
        return self._session.get(Permit, permit_id)

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
