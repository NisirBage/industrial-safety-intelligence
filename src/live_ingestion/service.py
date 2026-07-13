"""The one function every connector (real or mocked) calls to persist
a reading. Deliberately never calls `datetime.now()` - every caller
supplies its own timestamp explicitly (a CSV row's own column, a REST
request body's own field, a mock connector's own deterministic
simulated value), matching this project's no-wall-clock discipline
even though this package sits outside the strictly frozen
`src/domain`/`src/services` boundary.

`reading_id` is deliberately left to the model's own column default
(`uuid.uuid4`, see `src/infra/db/models/sensor_reading.py`) rather than
a deterministic `resolve_id()` derivation: unlike a scenario replay
(same seed, same output, always, by design), live-ingested data has no
scenario key to derive determinism from - it is the first real call
site the Core Freeze record's own Known Limitations section (§12)
already anticipated. This is a disclosed, intentional exception, not
an oversight.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import SensorReadingRepository, SensorRepository


class UnknownSensorError(ValueError):
    """Raised when a connector references a sensor id this platform doesn't know about."""


def ingest_reading(
    session: Session,
    sensor_id: uuid.UUID,
    value: float,
    unit: str,
    timestamp: datetime,
    quality_flag: str = "ok",
) -> SensorReading:
    sensor = SensorRepository(session).get(sensor_id)
    if sensor is None:
        raise UnknownSensorError(f"No sensor with id '{sensor_id}' exists.")

    reading = SensorReading(
        sensor_id=sensor.sensor_id,
        zone_id=sensor.zone_id,
        gas_type=sensor.gas_type,
        value=value,
        unit=unit,
        timestamp=timestamp,
        quality_flag=quality_flag,
    )
    return SensorReadingRepository(session).create(reading)


__all__ = ["UnknownSensorError", "ingest_reading"]
