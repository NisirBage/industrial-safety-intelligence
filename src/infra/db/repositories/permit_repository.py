"""Permit repository.

M1 provides only the minimal lookup/create surface. The Master Plan
explicitly has M4 extend this module for baseline-snapshot comparison
logic once the Permit Intelligence Agent exists - that logic is not
pre-built here.
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
