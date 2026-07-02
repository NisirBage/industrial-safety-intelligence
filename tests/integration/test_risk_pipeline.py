"""Integration tests for src/services/risk_pipeline.py - the complete
System Integration Layer sequence, against a live database.

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
from sqlalchemy import select

from src.domain.orchestrator.scheduler import AgentCache, NoLastKnownResultError
from src.domain.orchestrator.tiering import TierState
from src.domain.simulation.ids import resolve_id
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import SensorReadingRepository
from src.infra.db.seed import seed
from src.infra.db.session import get_session
from src.services.risk_pipeline import run_zone_tick

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
SENSOR_CH_CO_1 = resolve_id("sensor-ch-co-1")
NOW = datetime(2026, 7, 1, 9, 0, 0, tzinfo=UTC)


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


async def test_run_zone_tick_persists_a_normal_tier_assessment() -> None:
    """5 ppm against a 35 ppm threshold, no equipment degradation, no
    open permits in this zone: every agent stays well under the WATCH
    threshold, so the compound engine should land on "normal" - the
    exact case migration 0002 exists to allow persisting at all."""
    result = await run_zone_tick(
        ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial()
    )

    assert result.assessment.zone_id == ZONE_COMPRESSOR_HOUSE
    assert result.assessment.tier == "normal"
    assert result.tier_state.current_tier == "normal"
    assert result.counterfactual.alert is False

    with get_session() as session:
        row = session.get(RiskAssessment, (result.assessment.assessment_id, NOW))
        assert row is not None
        assert row.tier == "normal"


async def test_run_zone_tick_is_idempotent() -> None:
    """Re-running the identical tick must overwrite the same row, not
    duplicate it - deterministic assessment_id derivation plus
    RiskAssessmentRepository.create()'s existing merge()-based upsert
    (Phase 0, Persistence Strategy)."""
    first = await run_zone_tick(
        ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial()
    )
    second = await run_zone_tick(
        ZONE_COMPRESSOR_HOUSE, "CO", NOW, 1, AgentCache(), TierState.initial()
    )

    assert first.assessment.assessment_id == second.assessment.assessment_id

    with get_session() as session:
        rows = session.scalars(
            select(RiskAssessment).where(
                RiskAssessment.zone_id == ZONE_COMPRESSOR_HOUSE,
                RiskAssessment.timestamp == NOW,
            )
        ).all()
    assert len(rows) == 1


async def test_run_zone_tick_rolls_back_on_context_builder_failure() -> None:
    """An unknown gas type means Gas Risk's context builder raises -
    with an empty AgentCache (no prior success), the frozen scheduler
    has nothing to fall back on and raises NoLastKnownResultError,
    which must propagate out of run_zone_tick entirely, and no
    RiskAssessment row may be written (Phase 0, Failure Strategy)."""
    with pytest.raises(NoLastKnownResultError) as exc_info:
        await run_zone_tick(ZONE_COMPRESSOR_HOUSE, "H2S", NOW, 1, AgentCache(), TierState.initial())
    assert "no sensor for zone" in str(exc_info.value.__cause__)

    with get_session() as session:
        rows = session.scalars(
            select(RiskAssessment).where(RiskAssessment.zone_id == ZONE_COMPRESSOR_HOUSE)
        ).all()
    assert rows == []
