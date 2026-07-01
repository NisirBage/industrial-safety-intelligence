"""Equipment model (Technical Review Section 7.5)."""

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

ISOLATION_STATUSES = ("isolated", "active", "degraded")


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        CheckConstraint(
            f"isolation_status IN {ISOLATION_STATUSES}", name="ck_equipment_isolation_status"
        ),
    )

    equipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=False
    )
    equipment_type: Mapped[str] = mapped_column(String, nullable=False)
    isolation_status: Mapped[str] = mapped_column(String, nullable=False)
    maintenance_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    loto_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
