"""Risk assessment model (Technical Review Section 7.7) - a Timescale hypertable.

This is the Compound Risk Engine's output history. M1 only creates
the table; M5 (Orchestrator) is what actually writes rows into it.

Primary key is composite (``assessment_id``, ``timestamp``) for the
same Timescale reason as ``sensor_readings`` - see that model's
docstring.

``justification``'s frozen shape (Master Plan A.4):
``{"schema_version": 1, "rules_fired": [...],
"agent_contributions": {agent_name: {"risk": float, "confidence": float}},
"interaction_bonus_applied": float, "tier_before": str, "tier_after": str}``.
This is a contract for M5's writer and M6/M11's readers to follow; it
is not enforced at the database level since JSONB is schemaless.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

RISK_TIERS = ("watch", "elevated", "critical")


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    __table_args__ = (CheckConstraint(f"tier IN {RISK_TIERS}", name="ck_risk_assessments_tier"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    compound_risk_score: Mapped[float] = mapped_column(Numeric, nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric, nullable=False)
    tier: Mapped[str] = mapped_column(String, nullable=False)
    justification: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
