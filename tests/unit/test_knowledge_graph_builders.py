"""Unit tests for src/knowledge_graph/builders.py - pure functions, no
database. Every ORM row below is hand-constructed the same way
tests/unit/test_historical_feature_vector.py and
tests/unit/test_replay.py already do, not read from a live database.
"""

import uuid
from datetime import UTC, datetime

from src.domain.orchestrator.counterfactual import CounterfactualResult
from src.historical.decks import HistoricalIncident
from src.historical.lessons import Lesson
from src.infra.db.models.equipment import Equipment
from src.infra.db.models.permit import Permit
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor import Sensor
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.models.worker import Worker
from src.infra.db.models.zone import Zone
from src.knowledge_graph.builders import (
    build_business_impact_entity,
    build_counterfactual_entity,
    build_equipment_entity,
    build_forecast_entity,
    build_historical_incident_entity,
    build_lesson_entity,
    build_permit_entity,
    build_plant_entity,
    build_recommendation_entity,
    build_risk_assessment_entity,
    build_sensor_entity,
    build_sensor_reading_entity,
    build_triggered_agent_entity,
    build_worker_entity,
    build_zone_entity,
)
from src.knowledge_graph.entities import EntityKind
from src.knowledge_graph.recommendation_text import RecommendationTemplate

ZONE_ID = uuid.uuid4()


def test_build_plant_entity_uses_the_real_app_name_verbatim() -> None:
    entity = build_plant_entity("industrial-safety-intelligence")
    assert entity.kind == EntityKind.PLANT
    assert entity.label == "industrial-safety-intelligence"


def test_build_zone_entity_copies_every_real_field() -> None:
    zone = Zone(
        zone_id=ZONE_ID,
        name="Tank Farm",
        plant_section="Storage",
        oisd_area_classification="zone_1",
    )
    entity = build_zone_entity(zone)
    assert entity.kind == EntityKind.ZONE
    assert entity.id == str(ZONE_ID)
    assert entity.label == "Tank Farm"
    assert entity.attributes["plant_section"] == "Storage"
    assert entity.attributes["oisd_area_classification"] == "zone_1"


def test_build_sensor_entity_handles_missing_calibration_date() -> None:
    sensor = Sensor(
        sensor_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        gas_type="CO",
        alarm_threshold=50.0,
        last_calibrated_at=None,
    )
    entity = build_sensor_entity(sensor)
    assert entity.attributes["gas_type"] == "CO"
    assert entity.attributes["last_calibrated_at"] is None


def test_build_sensor_reading_entity() -> None:
    reading = SensorReading(
        reading_id=uuid.uuid4(),
        sensor_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        gas_type="CO",
        value=42.5,
        unit="ppm",
        timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        quality_flag="ok",
    )
    entity = build_sensor_reading_entity(reading)
    assert entity.attributes["value"] == 42.5
    assert entity.attributes["quality_flag"] == "ok"


def test_build_worker_entity() -> None:
    worker = Worker(worker_id=uuid.uuid4(), role="operator", current_zone_id=ZONE_ID)
    entity = build_worker_entity(worker)
    assert entity.label == "Operator"
    assert entity.attributes["current_zone_id"] == str(ZONE_ID)


def test_build_worker_entity_with_no_current_zone() -> None:
    worker = Worker(worker_id=uuid.uuid4(), role="auditor", current_zone_id=None)
    entity = build_worker_entity(worker)
    assert entity.attributes["current_zone_id"] is None


def test_build_equipment_entity() -> None:
    equipment = Equipment(
        equipment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        equipment_type="Compressor",
        isolation_status="active",
        maintenance_flag=True,
        loto_confirmed=False,
    )
    entity = build_equipment_entity(equipment)
    assert entity.attributes["isolation_status"] == "active"
    assert entity.attributes["maintenance_flag"] is True


def test_build_permit_entity() -> None:
    permit = Permit(
        permit_id=uuid.uuid4(),
        permit_type="hot_work",
        zone_id=ZONE_ID,
        issued_at=datetime(2026, 1, 1, tzinfo=UTC),
        expires_at=datetime(2026, 1, 2, tzinfo=UTC),
        authorizing_officer_id=uuid.uuid4(),
        baseline_snapshot={},
        status="active",
    )
    entity = build_permit_entity(permit)
    assert entity.label == "Hot Work permit"
    assert entity.attributes["status"] == "active"


def test_build_risk_assessment_entity() -> None:
    assessment = RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        compound_risk_score=72.5,
        confidence=0.8,
        tier="elevated",
        justification={},
    )
    entity = build_risk_assessment_entity(assessment)
    assert entity.label == "ELEVATED (72.5)"
    assert entity.attributes["compound_risk_score"] == 72.5


def test_build_triggered_agent_entity_reads_risk_and_confidence() -> None:
    assessment_id = uuid.uuid4()
    entity = build_triggered_agent_entity(
        assessment_id, "gas_risk", {"risk": 80.0, "confidence": 0.9}
    )
    assert entity.attributes["risk"] == 80.0
    assert entity.attributes["confidence"] == 0.9
    assert entity.label == "Gas Risk (80.0)"


def test_build_triggered_agent_entity_defaults_missing_fields_to_zero() -> None:
    entity = build_triggered_agent_entity(uuid.uuid4(), "equipment_status", {})
    assert entity.attributes["risk"] == 0.0
    assert entity.attributes["confidence"] == 0.0


def test_build_recommendation_entity() -> None:
    template = RecommendationTemplate(id="tier_critical", text="Evacuate now.", severity="critical")
    entity = build_recommendation_entity(uuid.uuid4(), template)
    assert entity.label == "Evacuate now."
    assert entity.attributes["severity"] == "critical"


def test_build_historical_incident_entity_falls_back_to_scenario_key_as_label() -> None:
    incident = HistoricalIncident(
        scenario_key="demo_vizag_clairton",
        root_cause="...",
        business_impact="...",
        operational_impact="...",
        safety_impact="...",
    )
    entity = build_historical_incident_entity(incident)
    assert entity.label == "demo_vizag_clairton"
    entity_with_title = build_historical_incident_entity(
        incident, title="Vizag-Clairton Demo Incident"
    )
    assert entity_with_title.label == "Vizag-Clairton Demo Incident"


def test_build_forecast_entity_without_result_has_minimal_attributes() -> None:
    entity = build_forecast_entity(ZONE_ID, datetime(2026, 1, 1, tzinfo=UTC), "demo_vizag_clairton")
    assert entity.attributes["scenario_key"] == "demo_vizag_clairton"
    assert "current_risk_score" not in entity.attributes


def test_build_lesson_entity() -> None:
    lesson = Lesson(rule="tier_escalated", lesson="Escalations past dwell time are real.")
    entity = build_lesson_entity(lesson)
    assert entity.id == "tier_escalated"
    assert entity.label == "Escalations past dwell time are real."


def test_build_counterfactual_entity_with_and_without_compound() -> None:
    result = CounterfactualResult(
        zone_id=ZONE_ID,
        sim_time=datetime(2026, 1, 1, tzinfo=UTC),
        alert=True,
        triggered_sensors=["s1"],
        highest_ratio=3.2,
    )
    entity = build_counterfactual_entity(ZONE_ID, datetime(2026, 1, 1, tzinfo=UTC), result, None)
    assert entity.label == "Naive baseline: ALERT"
    assert "compound_tier" not in entity.attributes

    compound = RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        compound_risk_score=10.0,
        confidence=0.9,
        tier="normal",
        justification={},
    )
    entity_with_compound = build_counterfactual_entity(
        ZONE_ID, datetime(2026, 1, 1, tzinfo=UTC), result, compound
    )
    assert entity_with_compound.attributes["compound_tier"] == "normal"


def test_build_business_impact_entity_available_vs_unavailable() -> None:
    available = build_business_impact_entity(
        "workers_affected", ZONE_ID, datetime(2026, 1, 1, tzinfo=UTC), value=3
    )
    assert available.attributes["value"] == 3
    assert "status" not in available.attributes

    unavailable = build_business_impact_entity(
        "downtime",
        ZONE_ID,
        datetime(2026, 1, 1, tzinfo=UTC),
        unavailable_reason="no downtime mechanic",
    )
    assert unavailable.attributes["status"] == "unavailable"
    assert "Unavailable" in unavailable.label
