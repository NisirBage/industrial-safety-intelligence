"""Sensor reading repository.

``latest`` is the domain method the Master Plan names by example
directly: "SensorReadingRepository.latest(zone_id, gas_type)".
``create`` is what M2's simulation writer calls once it exists.
"""

import uuid

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

    def create(self, reading: SensorReading) -> SensorReading:
        merged = self._session.merge(reading)
        self._session.flush()
        return merged
