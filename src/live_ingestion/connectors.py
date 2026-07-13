"""Mocked MQTT and OPC-UA connectors (Part 4 explicitly permits this).

Neither opens a real network socket or speaks either real wire
protocol. Each `poll()` call simulates exactly one inbound message for
a real, already-existing sensor - a fixed fraction of that sensor's
own real `alarm_threshold` (never `random.*`), matching this
project's platform-wide no-randomness discipline - and ingests it
through the same `ingest_reading()` every other connector uses. This
demonstrates the architecture's real shape (external protocol ->
ingestion service -> existing repository -> existing pipeline reads it
on its next tick), not a production-grade client for either protocol.
See docs/architecture/deployment_realism.md (M27 Part 11) for the full
connector architecture diagram and what a real MQTT/OPC-UA client would
additionally require.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import SensorRepository
from src.live_ingestion.service import UnknownSensorError, ingest_reading

_READING_UNIT = "ppm"  # matches src/services/simulation_runner.py's own real unit string


@dataclass(frozen=True)
class MockConnectorConfig:
    sensor_id: uuid.UUID
    #: Deterministic - a fixed fraction of the sensor's own real
    #: alarm_threshold, never a random value.
    value_fraction_of_threshold: float = 0.3


class MqttConnectorMock:
    """Stands in for a real MQTT subscriber. A production implementation
    would subscribe to a broker topic and call `ingest_reading` from its
    own message callback; this mock's `poll()` simulates exactly one
    such inbound message per call."""

    protocol = "MQTT"

    def __init__(self, config: MockConnectorConfig) -> None:
        self._config = config

    def poll(self, session: Session, timestamp: datetime) -> SensorReading:
        sensor = SensorRepository(session).get(self._config.sensor_id)
        if sensor is None:
            raise UnknownSensorError(f"No sensor with id '{self._config.sensor_id}' exists.")
        value = float(sensor.alarm_threshold) * self._config.value_fraction_of_threshold
        return ingest_reading(
            session, sensor.sensor_id, value=value, unit=_READING_UNIT, timestamp=timestamp
        )


class OpcUaConnectorMock(MqttConnectorMock):
    """Same mocked behavior as `MqttConnectorMock` - a production
    implementation would instead poll an OPC-UA server node rather than
    subscribe to a topic, but the ingestion path from that point on
    (`ingest_reading` onward) is identical."""

    protocol = "OPC-UA"


__all__ = ["MockConnectorConfig", "MqttConnectorMock", "OpcUaConnectorMock"]
