"""Sensor reading model (Technical Review Section 7.1) - a Timescale hypertable.

Primary key is composite (``reading_id``, ``timestamp``), not
``reading_id`` alone: Timescale requires the partitioning column to be
part of any unique constraint on a hypertable, so a single-column
primary key would fail when ``create_hypertable()`` runs in the
initial migration. See docs/schema_decisions.md.

The spec's two required indexes (``(zone_id, timestamp DESC)`` and
``(sensor_id, timestamp DESC)``) are created in the initial migration
via raw SQL rather than declared here, since SQLAlchemy's declarative
``Index()`` cannot express a DESC column direction without a live
column expression that isn't available in a class body.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.infra.db.models.base import Base
from src.infra.db.models.sensor import GAS_TYPES

QUALITY_FLAGS = ("ok", "stale", "out_of_calibration")


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        CheckConstraint(f"gas_type IN {GAS_TYPES}", name="ck_sensor_readings_gas_type"),
        CheckConstraint(f"quality_flag IN {QUALITY_FLAGS}", name="ck_sensor_readings_quality_flag"),
    )

    reading_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sensor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sensors.sensor_id", ondelete="CASCADE"), nullable=False
    )
    # Denormalized from sensors.zone_id for query speed (M1 task spec).
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("zones.zone_id", ondelete="RESTRICT"), nullable=False
    )
    gas_type: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float] = mapped_column(Numeric, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    quality_flag: Mapped[str] = mapped_column(String, nullable=False, default="ok")
