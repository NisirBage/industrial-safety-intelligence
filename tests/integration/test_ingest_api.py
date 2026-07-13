"""Integration tests for the Live Data Connectors REST surface
(M27 Part 4) - `/ingest/reading`, `/ingest/mock/{protocol}`,
`/ingest/status`. Requires a live Postgres instance, same category as
tests/integration/test_scenario_builder_api.py.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from src.domain.simulation.ids import resolve_id

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_TANK_FARM = resolve_id("zone-tank-farm")
SENSOR_TF_CH4 = resolve_id("sensor-tf-ch4-1")


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    from src.infra.db.seed import seed

    seed()
    yield
    command.downgrade(cfg, "base")


@pytest.fixture
def client() -> TestClient:
    from src.api.main import app

    return TestClient(app)


def test_ingest_reading_writes_a_real_sensor_reading(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ingest/reading",
        json={
            "sensor_id": str(SENSOR_TF_CH4),
            "value": 12.5,
            "unit": "ppm",
            "timestamp": "2026-07-01T09:00:00+00:00",
            "quality_flag": "ok",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["sensor_id"] == str(SENSOR_TF_CH4)
    assert body["zone_id"] == str(ZONE_TANK_FARM)
    assert body["gas_type"] == "CH4"
    assert body["value"] == 12.5


def test_ingest_reading_rejects_an_unknown_sensor(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ingest/reading",
        json={
            "sensor_id": "00000000-0000-0000-0000-000000000000",
            "value": 1.0,
            "unit": "ppm",
            "timestamp": "2026-07-01T09:00:00+00:00",
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SENSOR_NOT_FOUND"


def test_mock_mqtt_poll_ingests_a_deterministic_reading(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ingest/mock/mqtt",
        json={
            "zone_id": str(ZONE_TANK_FARM),
            "gas_type": "CH4",
            "timestamp": "2026-07-01T09:05:00+00:00",
        },
    )
    assert response.status_code == 200
    assert response.json()["sensor_id"] == str(SENSOR_TF_CH4)


def test_mock_poll_rejects_an_unknown_protocol(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ingest/mock/not-a-protocol",
        json={
            "zone_id": str(ZONE_TANK_FARM),
            "gas_type": "CH4",
            "timestamp": "2026-07-01T09:05:00+00:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UNKNOWN_PROTOCOL"


def test_connector_status_reports_real_vs_mocked(client: TestClient) -> None:
    response = client.get("/api/v1/ingest/status")
    assert response.status_code == 200
    connectors = {c["name"]: c for c in response.json()["connectors"]}
    assert connectors["CSV Watcher"]["mode"] == "implemented"
    assert connectors["REST API"]["mode"] == "implemented"
    assert connectors["MQTT Adapter"]["mode"] == "mock"
    assert connectors["OPC-UA Connector"]["mode"] == "mock"
