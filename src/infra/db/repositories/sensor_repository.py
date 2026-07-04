"""Sensor repository."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.sensor import Sensor


class SensorRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, sensor_id: uuid.UUID) -> Sensor | None:
        return self._session.get(Sensor, sensor_id)

    def get_by_zone_and_gas(self, zone_id: uuid.UUID, gas_type: str) -> Sensor | None:
        """Resolve which sensor in a zone monitors a given gas type.

        Added in M2: scenario events target a zone + gas type (per the
        Master Plan's own scenario-file wording), not a sensor UUID,
        so the simulation runner needs this to find which sensor a
        generated reading belongs to. Assumes at most one sensor per
        (zone, gas_type) pair, true of the M1 demo plant; there is no
        database-level uniqueness constraint enforcing this, since
        that would be a schema change beyond what M2 approved.
        """
        stmt = select(Sensor).where(Sensor.zone_id == zone_id, Sensor.gas_type == gas_type)
        return self._session.scalars(stmt).first()

    def list_by_zone(self, zone_id: uuid.UUID) -> list[Sensor]:
        """Every sensor monitoring a zone - the Decision Intelligence
        Layer's counterfactual endpoint needs this to discover which
        gas type(s) a zone monitors without the caller having to
        already know (unlike ``get_by_zone_and_gas``, which requires
        the gas type up front)."""
        stmt = select(Sensor).where(Sensor.zone_id == zone_id)
        return list(self._session.scalars(stmt).all())

    def create(self, sensor: Sensor) -> Sensor:
        merged = self._session.merge(sensor)
        self._session.flush()
        return merged
