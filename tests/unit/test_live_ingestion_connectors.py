"""Unit tests for src/live_ingestion/connectors.py - the mocked
MQTT/OPC-UA connectors' own deterministic value calculation, with
`SensorRepository.get` and `ingest_reading` stubbed out (no database
needed). Confirms these mocks never use `random.*` - the same
platform-wide determinism discipline the frozen engine holds,
applied here even though this package sits outside that boundary.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.infra.db.models.sensor import Sensor
from src.infra.db.repositories import SensorRepository
from src.live_ingestion import connectors
from src.live_ingestion.connectors import (
    MockConnectorConfig,
    MqttConnectorMock,
    OpcUaConnectorMock,
)
from src.live_ingestion.service import UnknownSensorError

SENSOR_ID = uuid.uuid4()
ZONE_ID = uuid.uuid4()
TIMESTAMP = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


def _sensor(alarm_threshold: float = 100.0) -> Sensor:
    return Sensor(
        sensor_id=SENSOR_ID,
        zone_id=ZONE_ID,
        gas_type="CO",
        last_calibrated_at=None,
        alarm_threshold=alarm_threshold,
    )


def test_mqtt_mock_derives_a_deterministic_value_from_the_real_alarm_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(SensorRepository, "get", lambda self, sensor_id: _sensor(100.0))
    captured: dict[str, object] = {}

    def fake_ingest_reading(session: object, sensor_id: object, **kwargs: object) -> str:
        captured["sensor_id"] = sensor_id
        captured.update(kwargs)
        return "reading"

    monkeypatch.setattr(connectors, "ingest_reading", fake_ingest_reading)

    connector = MqttConnectorMock(
        MockConnectorConfig(sensor_id=SENSOR_ID, value_fraction_of_threshold=0.3)
    )
    result = connector.poll(session=object(), timestamp=TIMESTAMP)

    assert result == "reading"
    assert captured["sensor_id"] == SENSOR_ID
    assert captured["value"] == pytest.approx(30.0)
    assert captured["unit"] == "ppm"
    assert captured["timestamp"] == TIMESTAMP


def test_opcua_mock_uses_the_same_ingestion_path_as_mqtt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(SensorRepository, "get", lambda self, sensor_id: _sensor(50.0))
    monkeypatch.setattr(connectors, "ingest_reading", lambda session, sensor_id, **kwargs: kwargs)

    connector = OpcUaConnectorMock(
        MockConnectorConfig(sensor_id=SENSOR_ID, value_fraction_of_threshold=0.5)
    )
    result = connector.poll(session=object(), timestamp=TIMESTAMP)

    assert result["value"] == pytest.approx(25.0)
    assert OpcUaConnectorMock.protocol == "OPC-UA"
    assert MqttConnectorMock.protocol == "MQTT"


def test_raises_unknown_sensor_error_for_a_sensor_that_does_not_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(SensorRepository, "get", lambda self, sensor_id: None)

    connector = MqttConnectorMock(MockConnectorConfig(sensor_id=SENSOR_ID))
    with pytest.raises(UnknownSensorError):
        connector.poll(session=object(), timestamp=TIMESTAMP)


def test_never_uses_randomness_to_derive_a_reading_value() -> None:
    import ast
    import inspect

    source = inspect.getsource(connectors)
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr.startswith("random"):
            raise AssertionError("connectors.py must never call random.*")
        if isinstance(node, ast.Name) and node.id == "random":
            raise AssertionError("connectors.py must never import/use random")
