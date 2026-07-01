"""Worker model (Technical Review Section 7.4)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

WORKER_ROLES = ("operator", "supervisor", "safety_officer", "contractor", "auditor")


class Worker(Base):
    __tablename__ = "workers"
    __table_args__ = (CheckConstraint(f"role IN {WORKER_ROLES}", name="ck_workers_role"),)

    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    # Current, mutable position from the location feed - not a
    # historical record, so losing the zone nulls this rather than
    # blocking the zone delete or deleting the worker.
    current_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="SET NULL"), nullable=True
    )
    last_position_update: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
