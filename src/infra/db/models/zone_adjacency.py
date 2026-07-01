"""Zone adjacency model.

Replaces the "informally-described static adjacency table" from the
original V1 schema (Master Plan A.4). Used by M4's SIMOPS check to
find zones adjacent to a permit's zone.
"""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base


class ZoneAdjacency(Base):
    __tablename__ = "zone_adjacency"
    __table_args__ = (
        CheckConstraint("zone_id <> adjacent_zone_id", name="ck_zone_adjacency_not_self"),
    )

    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.zone_id", ondelete="CASCADE"),
        primary_key=True,
    )
    adjacent_zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("zones.zone_id", ondelete="CASCADE"),
        primary_key=True,
    )
