"""Incident repository.

M11 (RAG) looks up structured metadata through this repository rather
than duplicating it into Chroma's payload beyond what retrieval needs
(ADR 0001).
"""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.incident import Incident


class IncidentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, incident_id: uuid.UUID) -> Incident | None:
        return self._session.get(Incident, incident_id)

    def create(self, incident: Incident) -> Incident:
        merged = self._session.merge(incident)
        self._session.flush()
        return merged
