"""Worker repository."""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.worker import Worker


class WorkerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, worker_id: uuid.UUID) -> Worker | None:
        return self._session.get(Worker, worker_id)

    def create(self, worker: Worker) -> Worker:
        merged = self._session.merge(worker)
        self._session.flush()
        return merged
