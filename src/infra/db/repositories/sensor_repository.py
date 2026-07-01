"""Sensor repository."""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.sensor import Sensor


class SensorRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, sensor_id: uuid.UUID) -> Sensor | None:
        return self._session.get(Sensor, sensor_id)

    def create(self, sensor: Sensor) -> Sensor:
        merged = self._session.merge(sensor)
        self._session.flush()
        return merged
