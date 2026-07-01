"""Risk assessment repository.

M1 creates this so the table exists and is reachable through the
repository layer; M5 (Orchestrator) is the actual writer once the
Compound Risk Engine exists.
"""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.risk_assessment import RiskAssessment


class RiskAssessmentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, assessment_id: uuid.UUID) -> RiskAssessment | None:
        return self._session.get(RiskAssessment, assessment_id)

    def create(self, assessment: RiskAssessment) -> RiskAssessment:
        merged = self._session.merge(assessment)
        self._session.flush()
        return merged
