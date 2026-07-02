"""Integration tests for the repository-querying context builders and
Counterfactual's reading-assembly function.

Requires a live Postgres/Timescale instance, same category as
tests/integration/test_db_constraints.py - not runnable in an
environment without Docker. The DB-free pure-assembly-helper tests
live in tests/unit/test_context_builders.py instead.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from src.domain.agents.base import AgentResult, Justification
from src.domain.agents.worker_exposure import PermitCoverage
from src.domain.simulation.ids import resolve_id
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import RiskAssessmentRepository, SensorReadingRepository
from src.infra.db.seed import seed
from src.infra.db.session import get_session
from src.services.context_builders import (
    build_counterfactual_readings,
    make_equipment_status_context_builder,
    make_gas_risk_context_builder,
    make_permit_intelligence_context_builder,
    make_worker_exposure_context_builder,
)

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")
SENSOR_CH_CO_1 = resolve_id("sensor-ch-co-1")
NOW = datetime(2026, 7, 1, 9, 0, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    yield
    command.downgrade(cfg, "base")


def test_gas_risk_context_builder_assembles_real_readings() -> None:
    with get_session() as session:
        SensorReadingRepository(session).create(
            SensorReading(
                reading_id=uuid.uuid4(),
                sensor_id=SENSOR_CH_CO_1,
                zone_id=ZONE_COMPRESSOR_HOUSE,
                gas_type="CO",
                value=12.0,
                unit="ppm",
                timestamp=NOW,
            )
        )

    with get_session() as session:
        builder = make_gas_risk_context_builder(session, "CO")
        agent_input = builder(ZONE_COMPRESSOR_HOUSE, NOW, 1, {})

    assert agent_input.context["alarm_threshold"] == 35.0
    readings = agent_input.context["readings"]
    assert isinstance(readings, list)
    assert readings[-1].value == 12.0


def test_gas_risk_context_builder_raises_for_unknown_sensor() -> None:
    with get_session() as session:
        builder = make_gas_risk_context_builder(session, "H2S")
        with pytest.raises(ValueError, match="no sensor for zone"):
            builder(ZONE_COMPRESSOR_HOUSE, NOW, 1, {})


def test_equipment_status_context_builder_returns_seeded_equipment() -> None:
    with get_session() as session:
        builder = make_equipment_status_context_builder(session)
        agent_input = builder(ZONE_COMPRESSOR_HOUSE, NOW, 1, {})

    equipment = agent_input.context["equipment"]
    assert isinstance(equipment, list)
    assert len(equipment) == 1
    assert equipment[0].equipment_type == "compressor"


def test_worker_exposure_context_builder_derives_permit_coverage_from_upstream() -> None:
    permit_intelligence_result = AgentResult(
        agent_name="permit_intelligence",
        risk=65.0,
        confidence=1.0,
        justification=Justification(
            summary="test", evidence={"decisions": [{"permit_identifier": "p1"}]}
        ),
        computed_at=NOW,
    )
    with get_session() as session:
        builder = make_worker_exposure_context_builder(session)
        agent_input = builder(
            ZONE_COMPRESSOR_HOUSE, NOW, 1, {"permit_intelligence": permit_intelligence_result}
        )

    permit_coverage = agent_input.context["permit_coverage"]
    assert isinstance(permit_coverage, PermitCoverage)
    assert permit_coverage.has_active_permit is True
    workers = agent_input.context["workers_present"]
    assert isinstance(workers, list)
    assert len(workers) == 1
    assert workers[0].role == "operator"


def test_permit_intelligence_context_builder_includes_open_permits() -> None:
    with get_session() as session:
        builder = make_permit_intelligence_context_builder(session)
        agent_input = builder(ZONE_TANK_FARM, NOW, 1, {})

    permits = agent_input.context["permits"]
    assert isinstance(permits, list)
    assert len(permits) == 1
    assert permits[0].permit_type == "hot_work"
    assert agent_input.context["permit_feed_stale"] is False


def test_permit_intelligence_context_builder_excludes_neighbor_with_no_history() -> None:
    """zone-compressor-house is adjacent to zone-tank-farm, but no
    RiskAssessment has been persisted for it yet - it must be excluded
    from adjacent_zones, never fabricated (Phase 0 design)."""
    with get_session() as session:
        builder = make_permit_intelligence_context_builder(session)
        agent_input = builder(ZONE_TANK_FARM, NOW, 1, {})

    assert agent_input.context["adjacent_zones"] == []


def test_permit_intelligence_context_builder_includes_neighbor_with_history() -> None:
    with get_session() as session:
        RiskAssessmentRepository(session).create(
            RiskAssessment(
                assessment_id=uuid.uuid4(),
                zone_id=ZONE_COMPRESSOR_HOUSE,
                timestamp=NOW - timedelta(minutes=5),
                compound_risk_score=40.0,
                confidence=0.8,
                tier="watch",
                justification={
                    "schema_version": 1,
                    "agent_contributions": {"gas_risk": {"risk": 55.0, "confidence": 0.8}},
                },
            )
        )

    with get_session() as session:
        builder = make_permit_intelligence_context_builder(session)
        agent_input = builder(ZONE_TANK_FARM, NOW, 1, {})

    adjacent_zones = agent_input.context["adjacent_zones"]
    assert isinstance(adjacent_zones, list)
    assert len(adjacent_zones) == 1
    assert adjacent_zones[0].zone_id == ZONE_COMPRESSOR_HOUSE
    assert adjacent_zones[0].gas_risk_score == 55.0


def test_build_counterfactual_readings_from_real_sensor_data() -> None:
    with get_session() as session:
        SensorReadingRepository(session).create(
            SensorReading(
                reading_id=uuid.uuid4(),
                sensor_id=SENSOR_CH_CO_1,
                zone_id=ZONE_COMPRESSOR_HOUSE,
                gas_type="CO",
                value=40.0,
                unit="ppm",
                timestamp=NOW,
            )
        )

    with get_session() as session:
        readings = build_counterfactual_readings(ZONE_COMPRESSOR_HOUSE, ["CO"], session)

    assert len(readings) == 1
    assert readings[0].value == 40.0
    assert readings[0].alarm_threshold == 35.0


def test_build_counterfactual_readings_skips_gas_type_with_no_sensor() -> None:
    with get_session() as session:
        readings = build_counterfactual_readings(ZONE_COMPRESSOR_HOUSE, ["H2S"], session)

    assert readings == []
