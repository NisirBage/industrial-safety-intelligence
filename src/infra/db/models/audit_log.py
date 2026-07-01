"""Audit log model (Technical Review Section 7.8).

M1 creates this table only. M6 owns the write logic, including the
chained-hash tamper-evidence field the Domain Research Report
recommends - adding that column now, before M6 defines how the hash
chain actually works, would be guessing at an interface rather than
building to one.

``zone_id`` is not in the Technical Review's field list for this
table, but was added here (nullable, RESTRICT) because M1's own
completion criteria requires testing that "ON DELETE RESTRICT
actually prevents deletion of a zone with audit log entries," which
is only possible if this table references a zone. See
docs/schema_decisions.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

AUDIT_EVENT_TYPES = ("risk_computed", "permit_flagged", "alert_sent", "action_confirmed")


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint(f"event_type IN {AUDIT_EVENT_TYPES}", name="ck_audit_log_event_type"),
    )

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    # "system" or a worker_id string, per spec - stored as free text,
    # not a foreign key.
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=True
    )
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
