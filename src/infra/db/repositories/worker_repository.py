"""Worker repository.

``list_by_current_zone`` is the System Integration Layer's addition
(Phase 0, Context Builder Design): Worker Exposure needs every worker
currently present in a zone, and no zone-scoped query existed before
this.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.worker import Worker


class WorkerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, worker_id: uuid.UUID) -> Worker | None:
        return self._session.get(Worker, worker_id)

    def list_by_current_zone(self, zone_id: uuid.UUID) -> list[Worker]:
        stmt = select(Worker).where(Worker.current_zone_id == zone_id)
        return list(self._session.scalars(stmt).all())

    def list_all(self) -> list[Worker]:
        """Every worker, regardless of current zone - the Scenario
        Builder's authorizing-officer picker needs this because a
        permit's officer isn't necessarily positioned in the zone the
        permit covers (unlike ``list_by_current_zone``, which is
        zone-scoped)."""
        return list(self._session.scalars(select(Worker)).all())

    def create(self, worker: Worker) -> Worker:
        merged = self._session.merge(worker)
        self._session.flush()
        return merged
