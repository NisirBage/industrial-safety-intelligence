"""Integration tests for M6's new repository read methods.

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
from src.infra.db.repositories import (
    AuditLogRepository,
    PermitRepository,
    RiskAssessmentRepository,
)
from src.infra.db.seed import seed
from src.infra.db.session import get_session

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")
NOW = datetime(2026, 7, 1, 9, 0, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    yield
    command.downgrade(cfg, "base")


def _assessment(zone_id: uuid.UUID, timestamp: datetime, tier: str, score: float) -> RiskAssessment:
    return RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=zone_id,
        timestamp=timestamp,
        compound_risk_score=score,
        confidence=1.0,
        tier=tier,
        justification={"schema_version": 1},
    )


def test_latest_for_all_zones_returns_one_row_per_zone() -> None:
    with get_session() as session:
        repo = RiskAssessmentRepository(session)
        repo.create(_assessment(ZONE_COMPRESSOR_HOUSE, NOW, "normal", 10.0))
        repo.create(_assessment(ZONE_COMPRESSOR_HOUSE, NOW + timedelta(minutes=5), "watch", 50.0))
        repo.create(_assessment(ZONE_TANK_FARM, NOW, "normal", 20.0))

    with get_session() as session:
        rows = RiskAssessmentRepository(session).latest_for_all_zones()

    by_zone = {row.zone_id: row for row in rows}
    assert len(rows) == 2
    assert by_zone[ZONE_COMPRESSOR_HOUSE].tier == "watch"  # the later of the two
    assert by_zone[ZONE_TANK_FARM].tier == "normal"


def test_history_by_zone_respects_limit_and_cursors() -> None:
    with get_session() as session:
        repo = RiskAssessmentRepository(session)
        for i in range(5):
            repo.create(
                _assessment(ZONE_COMPRESSOR_HOUSE, NOW + timedelta(minutes=i), "normal", float(i))
            )

    with get_session() as session:
        page = RiskAssessmentRepository(session).history_by_zone(
            ZONE_COMPRESSOR_HOUSE, limit=2, before=None, after=None
        )
    assert len(page) == 2
    assert page[0].timestamp > page[1].timestamp  # newest first

    with get_session() as session:
        filtered = RiskAssessmentRepository(session).history_by_zone(
            ZONE_COMPRESSOR_HOUSE, limit=10, before=None, after=NOW + timedelta(minutes=2)
        )
    assert all(row.timestamp > NOW + timedelta(minutes=2) for row in filtered)


def test_permit_list_all_filters_by_zone_and_status() -> None:
    with get_session() as session:
        repo = PermitRepository(session)
        all_permits = repo.list_all(zone_id=None, status=None, limit=100, before=None, after=None)
        assert len(all_permits) >= 1

        tank_farm_only = repo.list_all(
            zone_id=ZONE_TANK_FARM, status=None, limit=100, before=None, after=None
        )
        assert all(p.zone_id == ZONE_TANK_FARM for p in tank_farm_only)

        active_only = repo.list_all(
            zone_id=None, status="active", limit=100, before=None, after=None
        )
        assert all(p.status == "active" for p in active_only)


def test_audit_log_list_all_returns_empty_when_nothing_written() -> None:
    with get_session() as session:
        rows = AuditLogRepository(session).list_all(
            zone_id=None, event_type=None, limit=100, before=None, after=None
        )
    assert rows == []
