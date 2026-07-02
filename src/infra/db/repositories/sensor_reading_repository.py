"""Sensor reading repository.

``latest`` is the domain method the Master Plan names by example
directly: "SensorReadingRepository.latest(zone_id, gas_type)".
``create`` is what M2's simulation writer calls once it exists.
``recent`` is the System Integration Layer's addition (Phase 0,
Context Builder Design): Gas Risk Agent's own confidence/regression
logic needs an ordered *window* of readings, not just the single
latest one ``latest()`` returns.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.sensor_reading import SensorReading


class SensorReadingRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def latest(self, zone_id: uuid.UUID, gas_type: str) -> SensorReading | None:
        stmt = (
            select(SensorReading)
            .where(SensorReading.zone_id == zone_id, SensorReading.gas_type == gas_type)
            .order_by(SensorReading.timestamp.desc())
            .limit(1)
        )
        return self._session.scalars(stmt).first()

    def recent(
        self, zone_id: uuid.UUID, gas_type: str, before: datetime, limit: int
    ) -> list[SensorReading]:
        """The most recent ``limit`` readings at or before ``before``,
        returned oldest-to-newest - the ordering every consumer of a
        reading window in this project already expects (Gas Risk
        Agent's own ``calculate_risk``/``calculate_confidence``, per
        their docstrings)."""
        stmt = (
            select(SensorReading)
            .where(
                SensorReading.zone_id == zone_id,
                SensorReading.gas_type == gas_type,
                SensorReading.timestamp <= before,
            )
            .order_by(SensorReading.timestamp.desc())
            .limit(limit)
        )
        return list(reversed(self._session.scalars(stmt).all()))

    def create(self, reading: SensorReading) -> SensorReading:
        merged = self._session.merge(reading)
        self._session.flush()
        return merged
