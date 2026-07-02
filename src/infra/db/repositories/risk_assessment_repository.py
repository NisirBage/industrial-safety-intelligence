"""Risk assessment repository.

M1 creates this so the table exists and is reachable through the
repository layer; the System Integration Layer's ``risk_pipeline.py``
is the actual writer now that the Compound Risk Engine exists.

``latest_by_zone`` is the System Integration Layer's addition
(Phase 0, Context Builder Design): Permit Intelligence's SIMOPS check
needs an adjacent zone's most recently *persisted* Gas Risk
contribution as its cross-zone signal, since the frozen scheduler
computes only one zone at a time and this project's Phase 0 review
explicitly rejected introducing a second, same-tick, all-zones
orchestration pass to get a "fresher" number instead.

``latest_for_all_zones`` and ``history_by_zone`` are M6's additions -
the read paths behind ``GET /risk/current`` and
``GET /risk/history/{zone_id}``. Both are plain queries; no risk,
tier, or confidence value is computed here, only already-persisted
rows are selected.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.risk_assessment import RiskAssessment


class RiskAssessmentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, assessment_id: uuid.UUID) -> RiskAssessment | None:
        return self._session.get(RiskAssessment, assessment_id)

    def latest_by_zone(self, zone_id: uuid.UUID) -> RiskAssessment | None:
        stmt = (
            select(RiskAssessment)
            .where(RiskAssessment.zone_id == zone_id)
            .order_by(RiskAssessment.timestamp.desc())
            .limit(1)
        )
        return self._session.scalars(stmt).first()

    def latest_for_all_zones(self) -> list[RiskAssessment]:
        """One row per zone - the most recent assessment for each,
        via Postgres ``DISTINCT ON`` (``.distinct(column)`` combined
        with a matching leading ``order_by``, the standard SQLAlchemy
        idiom for it)."""
        stmt = (
            select(RiskAssessment)
            .distinct(RiskAssessment.zone_id)
            .order_by(RiskAssessment.zone_id, RiskAssessment.timestamp.desc())
        )
        return list(self._session.scalars(stmt).all())

    def history_by_zone(
        self,
        zone_id: uuid.UUID,
        limit: int,
        before: datetime | None,
        after: datetime | None,
    ) -> list[RiskAssessment]:
        stmt = select(RiskAssessment).where(RiskAssessment.zone_id == zone_id)
        if before is not None:
            stmt = stmt.where(RiskAssessment.timestamp < before)
        if after is not None:
            stmt = stmt.where(RiskAssessment.timestamp > after)
        stmt = stmt.order_by(RiskAssessment.timestamp.desc()).limit(limit)
        return list(self._session.scalars(stmt).all())

    def create(self, assessment: RiskAssessment) -> RiskAssessment:
        merged = self._session.merge(assessment)
        self._session.flush()
        return merged
