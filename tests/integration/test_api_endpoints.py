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


def test_zones_endpoint_lists_seeded_zones_with_real_names() -> None:
    response = client.get("/api/v1/zones")

    assert response.status_code == 200
    names = {row["name"] for row in response.json()}
    assert "Compressor House" in names
    assert "Tank Farm" in names


async def test_risk_assessment_endpoint_returns_a_persisted_row_by_id() -> None:
    result = await run_zone_tick(
        ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial()
    )

    response = client.get(f"/api/v1/risk/assessment/{result.assessment.assessment_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["assessment_id"] == str(result.assessment.assessment_id)
    assert body["tier"] == "normal"


def test_zone_worker_count_endpoint_reflects_seeded_workers() -> None:
    # demo_plant.json only assigns workers' current_zone to Compressor
    # House and Control Room - Tank Farm has none, so it's the wrong
    # zone to assert a non-zero count against.
    response = client.get(f"/api/v1/zones/{ZONE_COMPRESSOR_HOUSE}/workers/count")

    assert response.status_code == 200
    body = response.json()
    assert body["zone_id"] == str(ZONE_COMPRESSOR_HOUSE)
    assert body["worker_count"] >= 1


def test_zone_worker_count_endpoint_returns_zero_for_unknown_zone() -> None:
    response = client.get(f"/api/v1/zones/{uuid.uuid4()}/workers/count")

    assert response.status_code == 200
    assert response.json()["worker_count"] == 0


def test_risk_assessment_endpoint_404s_for_unknown_id() -> None:
    response = client.get(f"/api/v1/risk/assessment/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ASSESSMENT_NOT_FOUND"


async def test_counterfactual_endpoint_matches_the_frozen_functions_own_verdict() -> None:
    """Not a duplicate computation to compare against - this asserts
    the endpoint's result equals what calling the exact same frozen
    functions directly (as risk_pipeline.py itself does) produces,
    proving the endpoint delegates rather than reimplements."""
    tick = await run_zone_tick(
        ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial()
    )

    response = client.get(
        f"/api/v1/counterfactual/{ZONE_COMPRESSOR_HOUSE}",
        params={"timestamp": NOW.isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["counterfactual"]["alert"] == tick.counterfactual.alert
    assert body["counterfactual"]["triggered_sensors"] == tick.counterfactual.triggered_sensors
    assert body["compound"]["tier"] == tick.assessment.tier


def test_counterfactual_endpoint_handles_a_zone_with_no_sensor_data() -> None:
    """An unknown/unmonitored zone behaves like every other zone-scoped
    read in this API: no data found, no error - Counterfactual's own
    frozen 'missing data produces no alert' behaviour, not a new
    failure mode."""
    response = client.get(
        f"/api/v1/counterfactual/{uuid.uuid4()}", params={"timestamp": NOW.isoformat()}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["counterfactual"]["alert"] is False
    assert body["compound"] is None


def test_scenarios_endpoint_lists_the_authored_demo_scenario() -> None:
    response = client.get("/api/v1/scenarios")

    assert response.status_code == 200
    keys = {row["key"] for row in response.json()}
    assert "demo_vizag_clairton" in keys


def test_scenario_detail_endpoint_404s_for_unknown_key() -> None:
    response = client.get("/api/v1/scenarios/not-a-real-scenario")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SCENARIO_NOT_FOUND"
