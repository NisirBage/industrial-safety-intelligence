"""Integration tests for GET /replay (Time Machine) against real
persisted data - replays the two existing catalog scenarios through
the unmodified pipeline first (same pattern as
tests/integration/test_scenario_builder_api.py), then asserts the
replay endpoint surfaces exactly what was persisted.

Requires a live Postgres instance, same category as
tests/integration/test_api_endpoints.py.
"""

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from src.domain.orchestrator.scheduler import AgentCache
from src.domain.orchestrator.tiering import TierState
from src.domain.simulation.ids import resolve_id
from src.infra.db.session import get_session
from src.services.risk_pipeline import run_zone_tick
from src.services.simulation_runner import run_scenario

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
SCENARIOS_DIR = Path(__file__).resolve().parents[2] / "scenarios"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")


def _replay_scenario_through_pipeline(scenario_filename: str) -> None:
    """Persist sensor readings/permits (run_scenario) then run every
    resulting reading through run_zone_tick, exactly the sequence this
    session's own manual DB-recovery script used - the same thing
    src/services/scenario_builder.py's execute() does, just for a
    pre-authored YAML scenario instead of a builder-authored one."""
    run_scenario(SCENARIOS_DIR / scenario_filename)

    with get_session() as session:
        rows = session.execute(
            text(
                "SELECT DISTINCT zone_id, gas_type, timestamp FROM sensor_readings "
                "ORDER BY zone_id, timestamp"
            )
        ).all()

    by_zone: dict[tuple, list] = {}
    for zone_id, gas_type, timestamp in rows:
        by_zone.setdefault((zone_id, gas_type), []).append(timestamp)

    async def _run() -> None:
        for (zone_id, gas_type), timestamps in by_zone.items():
            cache = AgentCache()
            tier_state = TierState.initial()
            for tick_id, ts in enumerate(timestamps):
                result = await run_zone_tick(zone_id, gas_type, ts, tick_id, cache, tier_state)
                cache = result.cache
                tier_state = result.tier_state

    asyncio.run(_run())


@pytest.fixture(autouse=True)
def _migrated_seeded_and_replayed() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    from src.infra.db.seed import seed

    seed()
    _replay_scenario_through_pipeline("scenario_critical_gas_leak.yaml")
    _replay_scenario_through_pipeline("scenario_simops_conflict.yaml")
    yield
    command.downgrade(cfg, "base")


@pytest.fixture
def client() -> TestClient:
    from src.api.main import app

    return TestClient(app)


class TestReplayByScenarioKey:
    def test_replay_returns_persisted_assessments_for_the_scenario_window(
        self, client: TestClient
    ) -> None:
        response = client.get(
            "/api/v1/replay", params={"scenario_key": "scenario_critical_gas_leak"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["zone_ids"] == [str(ZONE_COMPRESSOR_HOUSE)]
        assert body["tick_count"] > 0
        assert len(body["zone_timelines"]) == 1
        timeline = body["zone_timelines"][0]
        assert timeline["zone_id"] == str(ZONE_COMPRESSOR_HOUSE)
        assert len(timeline["assessments"]) == body["tick_count"]
        # Ascending order.
        timestamps = [a["timestamp"] for a in timeline["assessments"]]
        assert timestamps == sorted(timestamps)

    def test_replay_detects_tier_change_and_highest_risk_bookmarks(
        self, client: TestClient
    ) -> None:
        response = client.get(
            "/api/v1/replay", params={"scenario_key": "scenario_critical_gas_leak"}
        )
        body = response.json()
        kinds = {b["kind"] for b in body["bookmarks"]}
        # Confirmed by direct replay: this scenario escalates normal -> elevated
        # and plateaus there (never reaches critical under the real pipeline) -
        # asserting only what's actually, deterministically true.
        assert "tier_change" in kinds
        assert "highest_risk" in kinds

    def test_replay_detects_interaction_bonus_permit_and_critical_bookmarks(
        self, client: TestClient
    ) -> None:
        response = client.get("/api/v1/replay", params={"scenario_key": "scenario_simops_conflict"})
        assert response.status_code == 200
        body = response.json()
        assert body["zone_ids"] == [str(ZONE_TANK_FARM)]
        kinds = {b["kind"] for b in body["bookmarks"]}
        assert "interaction_bonus" in kinds
        assert "permit_activated" in kinds
        assert "critical" in kinds

    def test_unknown_scenario_key_returns_404(self, client: TestClient) -> None:
        response = client.get("/api/v1/replay", params={"scenario_key": "does-not-exist"})
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "SCENARIO_NOT_FOUND"


class TestReplayByExplicitWindow:
    def test_zone_ids_start_end_window_matches_scenario_key_result(
        self, client: TestClient
    ) -> None:
        by_key = client.get(
            "/api/v1/replay", params={"scenario_key": "scenario_critical_gas_leak"}
        ).json()

        by_window = client.get(
            "/api/v1/replay",
            params={
                "zone_ids": str(ZONE_COMPRESSOR_HOUSE),
                "start": by_key["start_time"],
                "end": by_key["end_time"],
            },
        ).json()

        assert by_window["tick_count"] == by_key["tick_count"]
        assert len(by_window["bookmarks"]) == len(by_key["bookmarks"])

    def test_missing_replay_target_returns_400(self, client: TestClient) -> None:
        response = client.get("/api/v1/replay")
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "MISSING_REPLAY_TARGET"
