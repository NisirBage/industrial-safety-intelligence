"""Sensor model (Technical Review Section 7.2)."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base

GAS_TYPES = ("CO", "H2S", "CH4", "O2", "COG_pressure", "BFG_pressure")


class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (CheckConstraint(f"gas_type IN {GAS_TYPES}", name="ck_sensors_gas_type"),)

    sensor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=False
    )
    gas_type: Mapped[str] = mapped_column(String, nullable=False)
    # Feeds the Gas Risk agent's confidence score in M3; unused until then.
    last_calibrated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    alarm_threshold: Mapped[float] = mapped_column(Numeric, nullable=False)
