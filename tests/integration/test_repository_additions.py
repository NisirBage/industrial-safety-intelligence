"""Integration tests for the five repository methods the System
Integration Layer added.

Requires a live Postgres/Timescale instance, same category as
tests/integration/test_db_constraints.py - not runnable in an
environment without Docker.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from src.domain.simulation.ids import resolve_id
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import (
    EquipmentRepository,
    PermitRepository,
    RiskAssessmentRepository,
    SensorReadingRepository,
    WorkerRepository,
)
from src.infra.db.seed import seed
from src.infra.db.session import get_session

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")
SENSOR_CH_CO_1 = resolve_id("sensor-ch-co-1")
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    yield
    command.downgrade(cfg, "base")


def test_sensor_reading_recent_returns_window_oldest_to_newest() -> None:
    with get_session() as session:
        repo = SensorReadingRepository(session)
        for i in range(5):
            repo.create(
                SensorReading(
                    reading_id=uuid.uuid4(),
                    sensor_id=SENSOR_CH_CO_1,
                    zone_id=ZONE_COMPRESSOR_HOUSE,
                    gas_type="CO",
                    value=float(i),
                    unit="ppm",
                    timestamp=NOW + timedelta(minutes=i),
                )
            )

    with get_session() as session:
        repo = SensorReadingRepository(session)
        window = repo.recent(ZONE_COMPRESSOR_HOUSE, "CO", NOW + timedelta(minutes=10), limit=3)

    assert [r.value for r in window] == [2.0, 3.0, 4.0]
    assert window[0].timestamp < window[-1].timestamp


def test_sensor_reading_recent_excludes_readings_after_cutoff() -> None:
    with get_session() as session:
        repo = SensorReadingRepository(session)
        repo.create(
            SensorReading(
                reading_id=uuid.uuid4(),
                sensor_id=SENSOR_CH_CO_1,
                zone_id=ZONE_COMPRESSOR_HOUSE,
                gas_type="CO",
                value=99.0,
                unit="ppm",
                timestamp=NOW + timedelta(minutes=100),
            )
        )

    with get_session() as session:
        repo = SensorReadingRepository(session)
        window = repo.recent(ZONE_COMPRESSOR_HOUSE, "CO", NOW, limit=10)

    assert window == []


def test_equipment_list_by_zone_returns_only_that_zone() -> None:
    with get_session() as session:
        repo = EquipmentRepository(session)
        rows = repo.list_by_zone(ZONE_COMPRESSOR_HOUSE)

    assert len(rows) == 1
    assert rows[0].zone_id == ZONE_COMPRESSOR_HOUSE
    assert rows[0].equipment_type == "compressor"


def test_equipment_list_by_zone_empty_for_untracked_zone() -> None:
    with get_session() as session:
        repo = EquipmentRepository(session)
        rows = repo.list_by_zone(resolve_id("zone-control-room"))

    assert rows == []


def test_worker_list_by_current_zone_returns_only_that_zone() -> None:
    with get_session() as session:
        repo = WorkerRepository(session)
        rows = repo.list_by_current_zone(ZONE_COMPRESSOR_HOUSE)

    assert len(rows) == 1
    assert rows[0].role == "operator"


def test_worker_list_by_current_zone_ignores_workers_elsewhere() -> None:
    with get_session() as session:
        repo = WorkerRepository(session)
        rows = repo.list_by_current_zone(ZONE_TANK_FARM)

    assert rows == []


def test_permit_list_open_by_zone_excludes_closed() -> None:
    seeded_permit_id = resolve_id("permit-hotwork-1")

    with get_session() as session:
        repo = PermitRepository(session)
        open_before = repo.list_open_by_zone(ZONE_TANK_FARM)
        assert any(p.permit_id == seeded_permit_id for p in open_before)

        repo.update_status(seeded_permit_id, "closed")

    with get_session() as session:
        repo = PermitRepository(session)
        open_after = repo.list_open_by_zone(ZONE_TANK_FARM)
        assert all(p.permit_id != seeded_permit_id for p in open_after)


def test_risk_assessment_latest_by_zone_returns_most_recent() -> None:
    older = RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_COMPRESSOR_HOUSE,
        timestamp=NOW,
        compound_risk_score=10.0,
        confidence=1.0,
        tier="normal",
        justification={"schema_version": 1},
    )
    newer = RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_COMPRESSOR_HOUSE,
        timestamp=NOW + timedelta(minutes=5),
        compound_risk_score=50.0,
        confidence=0.9,
        tier="watch",
        justification={"schema_version": 1},
    )
    with get_session() as session:
        repo = RiskAssessmentRepository(session)
        repo.create(older)
        repo.create(newer)

    with get_session() as session:
        repo = RiskAssessmentRepository(session)
        latest = repo.latest_by_zone(ZONE_COMPRESSOR_HOUSE)

    assert latest is not None
    assert latest.tier == "watch"
    assert float(latest.compound_risk_score) == 50.0


def test_risk_assessment_latest_by_zone_none_when_no_history() -> None:
    with get_session() as session:
        repo = RiskAssessmentRepository(session)
        assert repo.latest_by_zone(ZONE_TANK_FARM) is None
