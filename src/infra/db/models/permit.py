"""Permit model (Technical Review Section 7.3).

``permit_repository.py`` is explicitly extended by M4 for baseline-
snapshot comparison logic; this module only provides the minimal
lookup/create surface M1 needs.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

PERMIT_TYPES = ("hot_work", "confined_space", "electrical_isolation", "line_break")
# Lowercase for consistency with every other enum column in the schema
# (see docs/schema_decisions.md for the naming reconciliation).
PERMIT_STATUSES = ("active", "flagged", "suspend_recommended", "closed")


class Permit(Base):
    __tablename__ = "permits"
    __table_args__ = (
        CheckConstraint(f"permit_type IN {PERMIT_TYPES}", name="ck_permits_permit_type"),
        CheckConstraint(f"status IN {PERMIT_STATUSES}", name="ck_permits_status"),
        # SIMOPS adjacency check (M4) and expiry sweeps, per spec.
        Index("ix_permits_zone_status", "zone_id", "status"),
        Index("ix_permits_status_expires", "status", "expires_at"),
    )

    permit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    permit_type: Mapped[str] = mapped_column(String, nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=False
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    authorizing_officer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.worker_id", ondelete="RESTRICT"), nullable=False
    )
    # Zone risk readings captured at issuance. Written once, never
    # mutated afterward, only compared against (M4 Task 3).
    baseline_snapshot: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
