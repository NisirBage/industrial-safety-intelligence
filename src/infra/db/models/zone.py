"""Zone model.

Added by the Master Plan's A.4 correction to the original V1 schema,
which referenced ``zone_id`` from sensors, equipment, permits,
workers, and risk_assessments without a formal parent table. Every
other model in this package has a foreign key back to this one.
"""

import uuid

from sqlalchemy import CheckConstraint, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

OISD_AREA_CLASSIFICATIONS = ("zone_0", "zone_1", "zone_2", "unclassified")


class Zone(Base):
    __tablename__ = "zones"
    __table_args__ = (
        CheckConstraint(
            f"oisd_area_classification IN {OISD_AREA_CLASSIFICATIONS}",
            name="ck_zones_oisd_area_classification",
        ),
    )

    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    oisd_area_classification: Mapped[str] = mapped_column(
        String, nullable=False, default="unclassified"
    )
    plant_section: Mapped[str] = mapped_column(String, nullable=False)
    # Lets a specific zone's fail-safe conservative floor be tuned
    # per-zone once real OISD-118 hazardous-area data is available,
    # rather than hardcoded globally. Unused until M5 reads it.
    elevated_floor_override: Mapped[float | None] = mapped_column(Numeric, nullable=True)
