"""Integration tests for the Scenario Builder's REST surface - the
first write endpoints in this API (`/scenario-builder/validate`,
`/scenario-builder/execute`) plus their supporting read endpoints
(`/workers`, `/zones/{id}/sensors`, `/zones/{id}/equipment`,
`/scenario-builder/options`).

Requires a live Postgres instance, same category as
tests/integration/test_api_endpoints.py.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from src.domain.simulation.ids import resolve_id
from src.infra.db.models.worker import Worker
from src.infra.db.repositories import WorkerRepository
from src.infra.db.session import get_session

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_TANK_FARM = resolve_id("zone-tank-farm")
ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
WORKER_SAFETY_OFFICER = resolve_id("worker-so-1")
WORKER_OPERATOR = resolve_id("worker-op-1")


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


def _valid_scenario_payload() -> dict:
    return {
        "title": "test scenario",
        "seed": 999,
        "start_time": "2026-07-15T09:00:00+00:00",
        "sensor_events": [
            {
                "name": "tf_ch4_rise",
                "zone_id": str(ZONE_TANK_FARM),
                "gas_type": "CH4",
                "sim_time": 0,
                "duration_minutes": 20,
                "sample_interval_minutes": 5,
                "curve": "linear_ramp",
                "params": {"start_value": 2, "slope": 0.1},
            }
        ],
        "permit_events": [
            {
                "name": "hotwork_1",
                "zone_id": str(ZONE_TANK_FARM),
                "sim_time": 5,
                "permit_type": "hot_work",
                "authorizing_officer_id": str(WORKER_SAFETY_OFFICER),
                "duration_minutes": 120,
            }
        ],
    }


class TestReadEndpoints:
    def test_list_workers_returns_seeded_workers(self, client: TestClient) -> None:
        response = client.get("/api/v1/workers")
        assert response.status_code == 200
        worker_ids = {row["worker_id"] for row in response.json()}
        assert str(WORKER_SAFETY_OFFICER) in worker_ids
        assert str(WORKER_OPERATOR) in worker_ids

    def test_list_zone_sensors_returns_the_right_gas_type(self, client: TestClient) -> None:
        response = client.get(f"/api/v1/zones/{ZONE_TANK_FARM}/sensors")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["gas_type"] == "CH4"

    def test_list_zone_equipment_returns_seeded_equipment(self, client: TestClient) -> None:
        response = client.get(f"/api/v1/zones/{ZONE_TANK_FARM}/equipment")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["equipment_type"] == "valve"

    def test_unknown_zone_returns_empty_lists_not_an_error(self, client: TestClient) -> None:
        response = client.get(f"/api/v1/zones/{resolve_id('zone-does-not-exist')}/sensors")
        assert response.status_code == 200
        assert response.json() == []

    def test_builder_options_lists_frozen_curve_and_permit_constants(
        self, client: TestClient
    ) -> None:
        response = client.get("/api/v1/scenario-builder/options")
        assert response.status_code == 200
        body = response.json()
        curve_names = {c["name"] for c in body["curves"]}
        assert {"linear_ramp", "exponential_rise", "step"} <= curve_names
        linear_ramp = next(c for c in body["curves"] if c["name"] == "linear_ramp")
        assert set(linear_ramp["required_params"]) == {"start_value", "slope"}
        assert "hot_work" in body["permit_types"]
        assert "CH4" in body["gas_types"]


class TestValidate:
    def test_valid_scenario_reports_no_errors(self, client: TestClient) -> None:
        response = client.post("/api/v1/scenario-builder/validate", json=_valid_scenario_payload())
        assert response.status_code == 200
        assert response.json() == {"valid": True, "errors": []}

    def test_duplicate_event_names_is_invalid(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["permit_events"][0]["name"] = payload["sensor_events"][0]["name"]
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert any("duplicate event name" in e for e in body["errors"])

    def test_unknown_zone_is_invalid(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["sensor_events"][0]["zone_id"] = str(resolve_id("zone-does-not-exist"))
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        body = response.json()
        assert body["valid"] is False
        assert any("unknown zone" in e for e in body["errors"])

    def test_gas_type_with_no_matching_sensor_is_invalid(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["sensor_events"][0]["gas_type"] = "H2S"  # Tank Farm only has a CH4 sensor
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        body = response.json()
        assert body["valid"] is False
        assert any("no sensor for zone" in e for e in body["errors"])

    def test_unknown_authorizing_officer_is_invalid(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["permit_events"][0]["authorizing_officer_id"] = str(
            resolve_id("worker-does-not-exist")
        )
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        body = response.json()
        assert body["valid"] is False
        assert any("unknown authorizing officer" in e for e in body["errors"])

    def test_officer_with_no_current_zone_is_invalid(self, client: TestClient) -> None:
        """'Worker outside every zone' - an authorizing officer who exists
        but has no current_zone_id at all."""
        unassigned_worker_id = resolve_id("worker-unassigned")
        with get_session() as session:
            WorkerRepository(session).create(
                Worker(worker_id=unassigned_worker_id, role="auditor", current_zone_id=None)
            )

        payload = _valid_scenario_payload()
        payload["permit_events"][0]["authorizing_officer_id"] = str(unassigned_worker_id)
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        body = response.json()
        assert body["valid"] is False
        assert any("not currently assigned to any zone" in e for e in body["errors"])

    def test_negative_gas_concentration_is_invalid(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["sensor_events"][0]["params"] = {"start_value": 2, "slope": -1.0}
        payload["sensor_events"][0]["duration_minutes"] = 20
        response = client.post("/api/v1/scenario-builder/validate", json=payload)
        body = response.json()
        assert body["valid"] is False
        assert any("negative concentration" in e for e in body["errors"])


class TestExecute:
    def test_valid_scenario_persists_readings_permits_and_assessments(
        self, client: TestClient
    ) -> None:
        response = client.post("/api/v1/scenario-builder/execute", json=_valid_scenario_payload())
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["errors"] == []
        assert len(body["zone_results"]) == 1

        zone_result = body["zone_results"][0]
        assert zone_result["zone_id"] == str(ZONE_TANK_FARM)
        assert zone_result["tick_count"] == 5  # 20 minutes / 5-minute interval + 1
        assert len(zone_result["assessment_ids"]) == zone_result["tick_count"]

        current = client.get("/api/v1/risk/current")
        matching = [row for row in current.json() if row["zone_id"] == str(ZONE_TANK_FARM)]
        assert len(matching) == 1
        assert matching[0]["tier"] == zone_result["final_tier"]

    def test_invalid_scenario_executes_nothing(self, client: TestClient) -> None:
        payload = _valid_scenario_payload()
        payload["sensor_events"][0]["zone_id"] = str(resolve_id("zone-does-not-exist"))
        response = client.post("/api/v1/scenario-builder/execute", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["zone_results"] == []

        current = client.get("/api/v1/risk/current")
        assert current.json() == []
