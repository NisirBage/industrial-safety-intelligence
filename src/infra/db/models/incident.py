"""Incident model (Technical Review Section 7.6).

Relational metadata only - no embedding column. Per ADR 0001, vector
embeddings live exclusively in ChromaDB (M11), keyed by
``incident_id``; this table is not a partial implementation of that
future feature, it is the complete M1 deliverable for this entity.
"""

import uuid
from datetime import date as date_type

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

INCIDENT_SOURCES = ("internal_near_miss", "historical_case", "regulatory_bulletin")


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (CheckConstraint(f"source IN {INCIDENT_SOURCES}", name="ck_incidents_source"),)

    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional cross-reference; losing the zone shouldn't destroy
    # incident history, just unlink it.
    linked_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="SET NULL"), nullable=True
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
