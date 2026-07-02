"""End-to-end integration tests for the M6 REST API endpoints,
against a live, migrated, seeded database with real Risk Pipeline
output persisted first - proving the API actually serves what the
frozen engine computed, not a fixture standing in for it.

Requires a live Postgres/Timescale instance, same category as
tests/integration/test_db_constraints.py - not runnable in an
environment without Docker.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from src.api.main import app
from src.domain.orchestrator.scheduler import AgentCache
from src.domain.orchestrator.tiering import TierState
from src.domain.simulation.ids import resolve_id
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import SensorReadingRepository
from src.infra.db.seed import seed
from src.infra.db.session import get_session
from src.services.risk_pipeline import run_zone_tick

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")
SENSOR_CH_CO_1 = resolve_id("sensor-ch-co-1")
NOW = datetime(2026, 7, 1, 9, 0, 0, tzinfo=UTC)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    with get_session() as session:
        SensorReadingRepository(session).create(
            SensorReading(
                reading_id=uuid.uuid4(),
                sensor_id=SENSOR_CH_CO_1,
                zone_id=ZONE_COMPRESSOR_HOUSE,
                gas_type="CO",
                value=5.0,
                unit="ppm",
                timestamp=NOW,
            )
        )
    yield
    command.downgrade(cfg, "base")


async def test_risk_current_reflects_a_real_pipeline_tick() -> None:
    await run_zone_tick(ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial())

    response = client.get("/api/v1/risk/current")

    assert response.status_code == 200
    rows = response.json()
    matching = [row for row in rows if row["zone_id"] == str(ZONE_COMPRESSOR_HOUSE)]
    assert len(matching) == 1
    assert matching[0]["tier"] == "normal"


async def test_risk_history_is_paginated() -> None:
    await run_zone_tick(ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial())

    response = client.get(f"/api/v1/risk/history/{ZONE_COMPRESSOR_HOUSE}", params={"limit": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 1
    assert body["count"] == 1
    assert len(body["items"]) == 1


def test_permits_endpoint_lists_seeded_permit_filtered_by_zone() -> None:
    response = client.get("/api/v1/permits", params={"zone_id": str(ZONE_TANK_FARM)})

    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert all(item["zone_id"] == str(ZONE_TANK_FARM) for item in body["items"])


def test_audit_endpoint_returns_empty_list() -> None:
    """No writer exists yet (M6 was scoped to the REST API only) -
    this is the expected, confirmed-empty state, not a bug."""
    response = client.get("/api/v1/audit")

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["count"] == 0
