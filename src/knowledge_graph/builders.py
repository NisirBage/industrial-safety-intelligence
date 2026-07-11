"""M26 Part 1 (Graph Model) - one pure function per entity kind,
each converting an already-fetched real row/dataclass into a
`GraphEntity`. Every `attributes` value below is copied verbatim from
a field that already exists on the object passed in - nothing here
queries anything itself (that is `GraphService`'s job) and nothing
here computes a new value.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from src.domain.orchestrator.counterfactual import CounterfactualResult
from src.foresight.service import ForesightResult
from src.historical.decks import HistoricalIncident
from src.historical.lessons import Lesson
from src.infra.db.models.equipment import Equipment
from src.infra.db.models.permit import Permit
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor import Sensor
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.models.worker import Worker
from src.infra.db.models.zone import Zone
from src.knowledge_graph.entities import (
    PLANT_ID,
    EntityKind,
    GraphEntity,
    business_impact_id,
    counterfactual_id,
    forecast_id,
    recommendation_id,
    triggered_agent_id,
)
from src.knowledge_graph.recommendation_text import RecommendationTemplate


def build_plant_entity(app_name: str) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.PLANT, id=PLANT_ID, label=app_name, attributes={"app_name": app_name}
    )


def build_zone_entity(zone: Zone) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.ZONE,
        id=str(zone.zone_id),
        label=zone.name,
        attributes={
            "zone_id": str(zone.zone_id),
            "name": zone.name,
            "plant_section": zone.plant_section,
            "oisd_area_classification": zone.oisd_area_classification,
        },
    )


def build_sensor_entity(sensor: Sensor) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.SENSOR,
        id=str(sensor.sensor_id),
        label=f"{sensor.gas_type} sensor",
        attributes={
            "sensor_id": str(sensor.sensor_id),
            "zone_id": str(sensor.zone_id),
            "gas_type": sensor.gas_type,
            "alarm_threshold": float(sensor.alarm_threshold),
            "last_calibrated_at": (
                sensor.last_calibrated_at.isoformat() if sensor.last_calibrated_at else None
            ),
        },
    )


def build_sensor_reading_entity(reading: SensorReading) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.SENSOR_READING,
        id=str(reading.reading_id),
        label=f"{reading.value} {reading.unit} ({reading.gas_type})",
        attributes={
            "reading_id": str(reading.reading_id),
            "sensor_id": str(reading.sensor_id),
            "zone_id": str(reading.zone_id),
            "gas_type": reading.gas_type,
            "value": float(reading.value),
            "unit": reading.unit,
            "timestamp": reading.timestamp.isoformat(),
            "quality_flag": reading.quality_flag,
        },
    )


def build_worker_entity(worker: Worker) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.WORKER,
        id=str(worker.worker_id),
        label=worker.role.replace("_", " ").title(),
        attributes={
            "worker_id": str(worker.worker_id),
            "role": worker.role,
            "current_zone_id": str(worker.current_zone_id) if worker.current_zone_id else None,
        },
    )


def build_equipment_entity(equipment: Equipment) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.EQUIPMENT,
        id=str(equipment.equipment_id),
        label=equipment.equipment_type,
        attributes={
            "equipment_id": str(equipment.equipment_id),
            "zone_id": str(equipment.zone_id),
            "equipment_type": equipment.equipment_type,
            "isolation_status": equipment.isolation_status,
            "maintenance_flag": equipment.maintenance_flag,
            "loto_confirmed": equipment.loto_confirmed,
        },
    )


def build_permit_entity(permit: Permit) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.PERMIT,
        id=str(permit.permit_id),
        label=f"{permit.permit_type.replace('_', ' ').title()} permit",
        attributes={
            "permit_id": str(permit.permit_id),
            "permit_type": permit.permit_type,
            "zone_id": str(permit.zone_id),
            "status": permit.status,
            "issued_at": permit.issued_at.isoformat(),
            "expires_at": permit.expires_at.isoformat(),
            "authorizing_officer_id": str(permit.authorizing_officer_id),
        },
    )


def build_risk_assessment_entity(assessment: RiskAssessment) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.RISK_ASSESSMENT,
        id=str(assessment.assessment_id),
        label=f"{assessment.tier.upper()} ({float(assessment.compound_risk_score):.1f})",
        attributes={
            "assessment_id": str(assessment.assessment_id),
            "zone_id": str(assessment.zone_id),
            "timestamp": assessment.timestamp.isoformat(),
            "compound_risk_score": float(assessment.compound_risk_score),
            "confidence": float(assessment.confidence),
            "tier": assessment.tier,
        },
    )


def _numeric_field(source: dict[str, object], key: str) -> float:
    value = source.get(key)
    return float(value) if isinstance(value, int | float) else 0.0


def build_triggered_agent_entity(
    assessment_id: uuid.UUID, agent_name: str, contribution: dict[str, object]
) -> GraphEntity:
    risk = _numeric_field(contribution, "risk")
    confidence = _numeric_field(contribution, "confidence")
    return GraphEntity(
        kind=EntityKind.TRIGGERED_AGENT,
        id=triggered_agent_id(assessment_id, agent_name),
        label=f"{agent_name.replace('_', ' ').title()} ({risk:.1f})",
        attributes={
            "assessment_id": str(assessment_id),
            "agent_name": agent_name,
            "risk": risk,
            "confidence": confidence,
        },
    )


def build_recommendation_entity(
    assessment_id: uuid.UUID, template: RecommendationTemplate
) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.RECOMMENDATION,
        id=recommendation_id(assessment_id, template.id),
        label=template.text,
        attributes={
            "assessment_id": str(assessment_id),
            "recommendation_id": template.id,
            "severity": template.severity,
            "text": template.text,
        },
    )


def build_historical_incident_entity(
    incident: HistoricalIncident, title: str | None = None, outcome_tier: str | None = None
) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.HISTORICAL_INCIDENT,
        id=incident.scenario_key,
        label=title or incident.scenario_key,
        attributes={
            "scenario_key": incident.scenario_key,
            "root_cause": incident.root_cause,
            "business_impact": incident.business_impact,
            "operational_impact": incident.operational_impact,
            "safety_impact": incident.safety_impact,
            "outcome_tier": outcome_tier,
        },
    )


def build_forecast_entity(
    zone_id: uuid.UUID,
    timestamp: datetime,
    scenario_key: str,
    result: ForesightResult | None = None,
) -> GraphEntity:
    attributes: dict[str, object] = {
        "zone_id": str(zone_id),
        "timestamp": timestamp.isoformat(),
        "scenario_key": scenario_key,
    }
    if result is not None:
        attributes["current_risk_score"] = result.current_risk_score
        attributes["current_tier"] = result.current_tier
        attributes["match_count"] = len(result.matches)
        attributes["confidence_overall"] = result.confidence.overall
        attributes["early_warning_category"] = result.early_warning.category
    return GraphEntity(
        kind=EntityKind.FORECAST,
        id=forecast_id(zone_id, timestamp),
        label=f"Forecast @ {timestamp.isoformat()}",
        attributes=attributes,
    )


def build_lesson_entity(lesson: Lesson) -> GraphEntity:
    return GraphEntity(
        kind=EntityKind.LESSON_LEARNED,
        id=lesson.rule,
        label=lesson.lesson,
        attributes={"rule": lesson.rule, "lesson": lesson.lesson},
    )


def build_counterfactual_entity(
    zone_id: uuid.UUID,
    timestamp: datetime,
    result: CounterfactualResult,
    compound: RiskAssessment | None,
) -> GraphEntity:
    attributes: dict[str, object] = {
        "zone_id": str(zone_id),
        "timestamp": timestamp.isoformat(),
        "alert": result.alert,
        "triggered_sensors": list(result.triggered_sensors),
        "highest_ratio": result.highest_ratio,
    }
    if compound is not None:
        attributes["compound_tier"] = compound.tier
        attributes["compound_risk_score"] = float(compound.compound_risk_score)
    label = "Naive baseline: ALERT" if result.alert else "Naive baseline: no alert"
    return GraphEntity(
        kind=EntityKind.COUNTERFACTUAL,
        id=counterfactual_id(zone_id, timestamp),
        label=label,
        attributes=attributes,
    )


def build_business_impact_entity(
    sub_kind: str,
    zone_id: uuid.UUID,
    timestamp: datetime,
    value: object = None,
    unavailable_reason: str | None = None,
) -> GraphEntity:
    node_id = business_impact_id(sub_kind, zone_id, timestamp)
    display_name = sub_kind.replace("_", " ").title()
    attributes: dict[str, object] = {
        "zone_id": str(zone_id),
        "timestamp": timestamp.isoformat(),
        "sub_kind": sub_kind,
    }
    if unavailable_reason is not None:
        attributes["status"] = "unavailable"
        attributes["reason"] = unavailable_reason
        label = f"{display_name}: Unavailable"
    else:
        attributes["value"] = value
        label = f"{display_name}: {value}"
    return GraphEntity(
        kind=EntityKind.BUSINESS_IMPACT, id=node_id, label=label, attributes=attributes
    )


__all__ = [
    "build_plant_entity",
    "build_zone_entity",
    "build_sensor_entity",
    "build_sensor_reading_entity",
    "build_worker_entity",
    "build_equipment_entity",
    "build_permit_entity",
    "build_risk_assessment_entity",
    "build_triggered_agent_entity",
    "build_recommendation_entity",
    "build_historical_incident_entity",
    "build_forecast_entity",
    "build_lesson_entity",
    "build_counterfactual_entity",
    "build_business_impact_entity",
]
