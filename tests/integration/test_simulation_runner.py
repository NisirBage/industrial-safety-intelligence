"""Integration tests for the simulation runner.

Requires a live Postgres/Timescale instance (same as
tests/integration/test_db_constraints.py) since this exercises the
real migration, the real seed data, and real repository writes - not
runnable in an environment without Docker.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select

from src.domain.simulation.scenario import ScenarioValidationError
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.seed import seed
from src.infra.db.session import get_session
from src.services.simulation_runner import run_scenario

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
DEMO_SCENARIO = Path(__file__).resolve().parents[2] / "scenarios" / "demo_vizag_clairton.yaml"


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    yield
    command.downgrade(cfg, "base")


def test_run_scenario_persists_readings_and_permits() -> None:
    run_scenario(DEMO_SCENARIO)

    with get_session() as session:
        readings = session.scalars(select(SensorReading)).all()
        assert len(readings) > 0


def test_run_scenario_is_idempotent() -> None:
    run_scenario(DEMO_SCENARIO)
    with get_session() as session:
        first_count = len(session.scalars(select(SensorReading)).all())

    run_scenario(DEMO_SCENARIO)
    with get_session() as session:
        second_count = len(session.scalars(select(SensorReading)).all())

    assert first_count == second_count


def test_run_scenario_fails_fast_on_unknown_zone(tmp_path: Path) -> None:
    bad_scenario = tmp_path / "bad.yaml"
    bad_scenario.write_text(
        """
seed: 1
start_time: "2026-01-01T00:00:00+00:00"
sensor_events:
  - name: bad_event
    zone: zone-does-not-exist
    gas_type: CO
    sim_time: 0
    duration_minutes: 5
    curve: step
    params: {baseline: 1, step_value: 2, step_time: 1}
"""
    )

    with pytest.raises(ScenarioValidationError, match="unknown zone"):
        run_scenario(bad_scenario)

    with get_session() as session:
        readings = session.scalars(select(SensorReading)).all()
        assert len(readings) == 0
