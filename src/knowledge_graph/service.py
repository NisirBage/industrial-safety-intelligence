"""M26 Part 3 (Graph Service) - entity lookup, neighborhood expansion,
subgraph generation, and search, over the 15 real entity kinds. Every
method is read-only and calls only existing repositories/services -
`RiskAssessmentRepository`, `ZoneRepository`, `SensorRepository`,
`WorkerRepository`, `EquipmentRepository`, `PermitRepository`,
`ZoneAdjacencyRepository`, `SensorReadingRepository`,
`src.historical.knowledge_base.find_similar_incidents`,
`src.historical.lessons.lessons_for_rules`,
`src.services.context_builders.build_counterfactual_readings`,
`src.domain.orchestrator.counterfactual.evaluate`,
`src.services.scenario_catalog.load_catalog`. Nothing here computes a
risk score, tier, forecast, or recommendation - it only assembles
already-computed values into `GraphEntity`/`GraphEdge` pairs.

Performance discipline (Part 14): `get_neighbors` never expands more
than one hop, and every one-to-many expansion that could be
unbounded (a zone's risk-assessment history, in particular) is capped
at `_RECENT_ASSESSMENT_LIMIT`. `get_subgraph` performs a bounded BFS
(`max_nodes` ceiling) rather than ever materializing "the whole
graph." The two genuinely expensive traversals - a RiskAssessment's
matched historical incidents, and a Forecast's own evidence - reuse
the existing, already-optimized `find_similar_incidents`/
`generate_operational_foresight` functions (which have their own
established caching, see `src/historical/knowledge_base.py`'s
`_INDEX_CACHE`) and are only paid when a caller actually expands that
specific node, never eagerly.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from src.config.settings import get_settings
from src.domain.orchestrator.counterfactual import evaluate as evaluate_counterfactual
from src.historical.analytics import _EQUIPMENT_RULES, _PERMIT_RULES, _WORKER_RULES
from src.historical.decks import HISTORICAL_DECKS
from src.historical.knowledge_base import (
    _build_index_for_deck,
    _outcome_tier,
    find_similar_incidents,
)
from src.historical.lessons import lessons_for_rules
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.repositories import (
    EquipmentRepository,
    PermitRepository,
    RiskAssessmentRepository,
    SensorReadingRepository,
    SensorRepository,
    WorkerRepository,
    ZoneAdjacencyRepository,
    ZoneRepository,
)
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
from src.knowledge_graph.entities import (
    BUSINESS_IMPACT_AVAILABLE_KINDS,
    PLANT_ID,
    EntityKind,
    GraphEntity,
    parse_business_impact_id,
    parse_recommendation_id,
    parse_triggered_agent_id,
    parse_zone_timestamp_id,
)
from src.knowledge_graph.recommendation_text import recommendation_templates_for
from src.knowledge_graph.relationships import GraphEdge, RelationKind
from src.services.context_builders import build_counterfactual_readings
from src.services.scenario_catalog import get_scenario_summary, load_catalog

#: Gas Risk's own real rule identifiers (src/domain/agents/gas_risk.py)
#: - the one agent-owned group `src/historical/analytics.py` doesn't
#: already name as a frozenset (its "causes" bucket is deliberately
#: ungrouped). Used only to compute the Recommendation->TriggeredAgent
#: `ADDRESSES` edge; never used to compute risk.
_GAS_RISK_RULES = frozenset(
    {
        "missing_data_fail_safe",
        "stale_data_fail_safe",
        "saturating_threshold_function",
        "insufficient_history",
    }
)

_RECENT_ASSESSMENT_LIMIT = 5
_MAX_SUBGRAPH_NODES = 60


def _rule_owning_agent(rule: str) -> str | None:
    if rule in _GAS_RISK_RULES:
        return "gas_risk"
    if rule in _EQUIPMENT_RULES:
        return "equipment_status"
    if rule in _WORKER_RULES:
        return "worker_exposure"
    if rule in _PERMIT_RULES:
        return "permit_intelligence"
    return None


def _rules_fired(assessment: RiskAssessment) -> list[str]:
    rules = assessment.justification.get("rules_fired") if assessment.justification else None
    return [r for r in rules if isinstance(r, str)] if isinstance(rules, list) else []


def _agent_contributions(assessment: RiskAssessment) -> dict[str, dict[str, object]]:
    contributions = (
        assessment.justification.get("agent_contributions") if assessment.justification else None
    )
    return contributions if isinstance(contributions, dict) else {}


def _resolve_scenario_key(zone_id: uuid.UUID, timestamp: datetime) -> str | None:
    """Which cataloged scenario this (zone, tick) belongs to - a real,
    grounded lookup (the scenario whose real time window contains the
    tick and whose real zone_ids include this zone), never a guess."""
    for summary in load_catalog():
        if zone_id in summary.zone_ids and summary.start_time <= timestamp <= summary.end_time:
            return summary.key
    return None


class GraphService:
    def __init__(self, session: Session) -> None:
        self._session = session

    # -- entity lookup ----------------------------------------------

    def get_entity(self, kind: str, entity_id: str) -> GraphEntity | None:
        session = self._session

        if kind == EntityKind.PLANT:
            return build_plant_entity(get_settings().app_name)

        if kind == EntityKind.ZONE:
            zone = ZoneRepository(session).get(uuid.UUID(entity_id))
            return build_zone_entity(zone) if zone else None

        if kind == EntityKind.SENSOR:
            sensor = SensorRepository(session).get(uuid.UUID(entity_id))
            return build_sensor_entity(sensor) if sensor else None

        if kind == EntityKind.WORKER:
            worker = WorkerRepository(session).get(uuid.UUID(entity_id))
            return build_worker_entity(worker) if worker else None

        if kind == EntityKind.EQUIPMENT:
            equipment = EquipmentRepository(session).get(uuid.UUID(entity_id))
            return build_equipment_entity(equipment) if equipment else None

        if kind == EntityKind.PERMIT:
            permit = PermitRepository(session).get(uuid.UUID(entity_id))
            return build_permit_entity(permit) if permit else None

        if kind == EntityKind.RISK_ASSESSMENT:
            assessment = RiskAssessmentRepository(session).get(uuid.UUID(entity_id))
            return build_risk_assessment_entity(assessment) if assessment else None

        if kind == EntityKind.TRIGGERED_AGENT:
            return self._get_triggered_agent(entity_id)

        if kind == EntityKind.RECOMMENDATION:
            return self._get_recommendation(entity_id)

        if kind == EntityKind.HISTORICAL_INCIDENT:
            return self._get_historical_incident(entity_id)

        if kind == EntityKind.FORECAST:
            return self._get_forecast(entity_id)

        if kind == EntityKind.LESSON_LEARNED:
            templates = lessons_for_rules([entity_id])
            return build_lesson_entity(templates[0]) if templates else None

        if kind == EntityKind.COUNTERFACTUAL:
            return self._get_counterfactual(entity_id)

        if kind == EntityKind.BUSINESS_IMPACT:
            return self._get_business_impact(entity_id)

        return None

    def _get_triggered_agent(self, entity_id: str) -> GraphEntity | None:
        parsed = parse_triggered_agent_id(entity_id)
        if parsed is None:
            return None
        assessment_id_str, agent_name = parsed
        assessment = RiskAssessmentRepository(self._session).get(uuid.UUID(assessment_id_str))
        if assessment is None:
            return None
        contribution = _agent_contributions(assessment).get(agent_name)
        if not isinstance(contribution, dict):
            return None
        return build_triggered_agent_entity(assessment.assessment_id, agent_name, contribution)

    def _get_recommendation(self, entity_id: str) -> GraphEntity | None:
        parsed = parse_recommendation_id(entity_id)
        if parsed is None:
            return None
        assessment_id_str, recommendation_key = parsed
        assessment = RiskAssessmentRepository(self._session).get(uuid.UUID(assessment_id_str))
        if assessment is None:
            return None
        templates = recommendation_templates_for(assessment.tier, _rules_fired(assessment))
        for template in templates:
            if template.id == recommendation_key:
                return build_recommendation_entity(assessment.assessment_id, template)
        return None

    def _get_historical_incident(self, scenario_key: str) -> GraphEntity | None:
        for deck in HISTORICAL_DECKS:
            for incident in deck.incidents:
                if incident.scenario_key == scenario_key:
                    summary = get_scenario_summary(scenario_key)
                    return build_historical_incident_entity(
                        incident, title=summary.title if summary else None
                    )
        return None

    def _get_forecast(self, entity_id: str) -> GraphEntity | None:
        parsed = parse_zone_timestamp_id(entity_id)
        if parsed is None:
            return None
        zone_id_str, timestamp_str = parsed
        zone_id = uuid.UUID(zone_id_str)
        timestamp = datetime.fromisoformat(timestamp_str)
        scenario_key = _resolve_scenario_key(zone_id, timestamp)
        if scenario_key is None:
            return None
        return build_forecast_entity(zone_id, timestamp, scenario_key)

    def _get_counterfactual(self, entity_id: str) -> GraphEntity | None:
        parsed = parse_zone_timestamp_id(entity_id)
        if parsed is None:
            return None
        zone_id = uuid.UUID(parsed[0])
        timestamp = datetime.fromisoformat(parsed[1])
        return self._build_counterfactual(zone_id, timestamp)

    def _build_counterfactual(self, zone_id: uuid.UUID, timestamp: datetime) -> GraphEntity | None:
        session = self._session
        sensors = SensorRepository(session).list_by_zone(zone_id)
        gas_types = [sensor.gas_type for sensor in sensors]
        readings = build_counterfactual_readings(zone_id, gas_types, session, as_of=timestamp)
        result = evaluate_counterfactual(zone_id, timestamp, readings)
        compound = RiskAssessmentRepository(session).get_by_zone_and_timestamp(zone_id, timestamp)
        return build_counterfactual_entity(zone_id, timestamp, result, compound)

    def _get_business_impact(self, entity_id: str) -> GraphEntity | None:
        parsed = parse_business_impact_id(entity_id)
        if parsed is None:
            return None
        sub_kind, zone_id_str, timestamp_str = parsed
        zone_id = uuid.UUID(zone_id_str)
        timestamp = datetime.fromisoformat(timestamp_str)
        return self._build_business_impact(sub_kind, zone_id, timestamp)

    def _build_business_impact(
        self, sub_kind: str, zone_id: uuid.UUID, timestamp: datetime
    ) -> GraphEntity | None:
        session = self._session

        if sub_kind not in BUSINESS_IMPACT_AVAILABLE_KINDS:
            return build_business_impact_entity(
                sub_kind,
                zone_id,
                timestamp,
                unavailable_reason=(
                    f"No {sub_kind.replace('_', ' ')} mechanic exists anywhere in this "
                    "platform's real data model."
                ),
            )

        if sub_kind == "business_impact":
            assessment = RiskAssessmentRepository(session).get_by_zone_and_timestamp(
                zone_id, timestamp
            )
            value = assessment.tier if assessment else None
            return build_business_impact_entity(sub_kind, zone_id, timestamp, value=value)

        if sub_kind == "workers_affected":
            count = len(WorkerRepository(session).list_by_current_zone(zone_id))
            return build_business_impact_entity(sub_kind, zone_id, timestamp, value=count)

        if sub_kind == "permit_impact":
            permits = PermitRepository(session).list_all(
                zone_id=zone_id, status=None, limit=100, before=None, after=None
            )
            active = sum(1 for p in permits if p.status == "active")
            flagged = sum(1 for p in permits if p.status == "flagged")
            suspended = sum(1 for p in permits if p.status == "suspend_recommended")
            value = f"{active} active, {flagged} flagged, {suspended} suspend-recommended"
            return build_business_impact_entity(sub_kind, zone_id, timestamp, value=value)

        if sub_kind == "operational_stability":
            # Deliberately not computed here: Operational Foresight's
            # early-warning category is the real backing data, but
            # generating it requires a full trajectory match (the same
            # cost as a Forecast node) - only worth paying when a
            # caller actually asks for this specific sub-node.
            return build_business_impact_entity(
                sub_kind,
                zone_id,
                timestamp,
                unavailable_reason=(
                    "Requires a computed Operational Foresight result - "
                    "expand the zone's Forecast node for this tick instead."
                ),
            )

        return None

    # -- neighbors ----------------------------------------------------

    def get_neighbors(self, kind: str, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        dispatch = {
            EntityKind.PLANT: self._neighbors_of_plant,
            EntityKind.ZONE: self._neighbors_of_zone,
            EntityKind.SENSOR: self._neighbors_of_sensor,
            EntityKind.SENSOR_READING: self._neighbors_of_sensor_reading,
            EntityKind.WORKER: self._neighbors_of_worker,
            EntityKind.EQUIPMENT: self._neighbors_of_equipment,
            EntityKind.PERMIT: self._neighbors_of_permit,
            EntityKind.RISK_ASSESSMENT: self._neighbors_of_risk_assessment,
            EntityKind.TRIGGERED_AGENT: self._neighbors_of_triggered_agent,
            EntityKind.RECOMMENDATION: self._neighbors_of_recommendation,
            EntityKind.HISTORICAL_INCIDENT: self._neighbors_of_historical_incident,
            EntityKind.FORECAST: self._neighbors_of_forecast,
            EntityKind.LESSON_LEARNED: self._neighbors_of_lesson,
            EntityKind.COUNTERFACTUAL: self._neighbors_of_counterfactual,
            EntityKind.BUSINESS_IMPACT: self._neighbors_of_business_impact,
        }
        handler = dispatch.get(kind)
        if handler is None:
            return []
        return handler(entity_id)

    def _neighbors_of_plant(self, _entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        zones = ZoneRepository(self._session).list_all()
        return [
            (
                GraphEdge(
                    EntityKind.PLANT,
                    PLANT_ID,
                    RelationKind.CONTAINS,
                    EntityKind.ZONE,
                    str(z.zone_id),
                    z.name,
                ),
                build_zone_entity(z),
            )
            for z in zones
        ]

    def _neighbors_of_zone(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        zone_id = uuid.UUID(entity_id)
        neighbors: list[tuple[GraphEdge, GraphEntity]] = []

        for sensor in SensorRepository(session).list_by_zone(zone_id):
            entity = build_sensor_entity(sensor)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.SENSOR,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for worker in WorkerRepository(session).list_by_current_zone(zone_id):
            entity = build_worker_entity(worker)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.WORKER,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for equipment in EquipmentRepository(session).list_by_zone(zone_id):
            entity = build_equipment_entity(equipment)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.EQUIPMENT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        permits = PermitRepository(session).list_all(
            zone_id=zone_id, status=None, limit=50, before=None, after=None
        )
        for permit in permits:
            entity = build_permit_entity(permit)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.PERMIT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for adjacent_id in ZoneAdjacencyRepository(session).adjacent_zone_ids(zone_id):
            adjacent_zone = ZoneRepository(session).get(adjacent_id)
            if adjacent_zone is None:
                continue
            entity = build_zone_entity(adjacent_zone)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.ADJACENT_TO,
                        EntityKind.ZONE,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        recent = RiskAssessmentRepository(session).history_by_zone(
            zone_id, limit=_RECENT_ASSESSMENT_LIMIT, before=None, after=None
        )
        for assessment in recent:
            entity = build_risk_assessment_entity(assessment)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.ZONE,
                        entity_id,
                        RelationKind.ASSESSED_BY,
                        EntityKind.RISK_ASSESSMENT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        return neighbors

    def _neighbors_of_sensor(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        sensor = SensorRepository(self._session).get(uuid.UUID(entity_id))
        if sensor is None:
            return []
        reading = SensorReadingRepository(self._session).latest(sensor.zone_id, sensor.gas_type)
        if reading is None:
            return []
        entity = build_sensor_reading_entity(reading)
        return [
            (
                GraphEdge(
                    EntityKind.SENSOR,
                    entity_id,
                    RelationKind.PRODUCED,
                    EntityKind.SENSOR_READING,
                    entity.id,
                    entity.label,
                ),
                entity,
            )
        ]

    def _neighbors_of_sensor_reading(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        # Composite lookup by reading_id alone isn't available - a
        # SensorReading's only real neighbor (its own Sensor) is
        # already shown via Sensor->SensorReading; nothing new to add
        # in the reverse direction without a dedicated repository
        # lookup this entity kind doesn't need elsewhere in the app.
        return []

    def _neighbors_of_worker(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        worker = WorkerRepository(session).get(uuid.UUID(entity_id))
        if worker is None or worker.current_zone_id is None:
            return []
        neighbors: list[tuple[GraphEdge, GraphEntity]] = []
        zone = ZoneRepository(session).get(worker.current_zone_id)
        if zone is not None:
            zone_entity = build_zone_entity(zone)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.WORKER,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.ZONE,
                        zone_entity.id,
                        zone_entity.label,
                    ),
                    zone_entity,
                )
            )
        permits = PermitRepository(session).list_all(
            zone_id=worker.current_zone_id, status=None, limit=100, before=None, after=None
        )
        for permit in permits:
            if permit.authorizing_officer_id != worker.worker_id:
                continue
            entity = build_permit_entity(permit)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.WORKER,
                        entity_id,
                        RelationKind.AUTHORIZES,
                        EntityKind.PERMIT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )
        return neighbors

    def _neighbors_of_equipment(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        equipment = EquipmentRepository(self._session).get(uuid.UUID(entity_id))
        if equipment is None:
            return []
        zone = ZoneRepository(self._session).get(equipment.zone_id)
        if zone is None:
            return []
        entity = build_zone_entity(zone)
        return [
            (
                GraphEdge(
                    EntityKind.EQUIPMENT,
                    entity_id,
                    RelationKind.CONTAINS,
                    EntityKind.ZONE,
                    entity.id,
                    entity.label,
                ),
                entity,
            )
        ]

    def _neighbors_of_permit(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        permit = PermitRepository(session).get(uuid.UUID(entity_id))
        if permit is None:
            return []
        neighbors: list[tuple[GraphEdge, GraphEntity]] = []
        zone = ZoneRepository(session).get(permit.zone_id)
        if zone is not None:
            entity = build_zone_entity(zone)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.PERMIT,
                        entity_id,
                        RelationKind.CONTAINS,
                        EntityKind.ZONE,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )
        officer = WorkerRepository(session).get(permit.authorizing_officer_id)
        if officer is not None:
            entity = build_worker_entity(officer)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.PERMIT,
                        entity_id,
                        RelationKind.AUTHORIZES,
                        EntityKind.WORKER,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )
        return neighbors

    def _neighbors_of_risk_assessment(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        assessment = RiskAssessmentRepository(session).get(uuid.UUID(entity_id))
        if assessment is None:
            return []
        neighbors: list[tuple[GraphEdge, GraphEntity]] = []

        zone = ZoneRepository(session).get(assessment.zone_id)
        if zone is not None:
            entity = build_zone_entity(zone)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.FOR_ZONE,
                        EntityKind.ZONE,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for agent_name, contribution in _agent_contributions(assessment).items():
            if not isinstance(contribution, dict):
                continue
            risk = contribution.get("risk")
            if not isinstance(risk, int | float) or risk <= 0:
                continue
            entity = build_triggered_agent_entity(
                assessment.assessment_id, agent_name, contribution
            )
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.TRIGGERED,
                        EntityKind.TRIGGERED_AGENT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for template in recommendation_templates_for(assessment.tier, _rules_fired(assessment)):
            entity = build_recommendation_entity(assessment.assessment_id, template)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.GENERATED,
                        EntityKind.RECOMMENDATION,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        for match in find_similar_incidents(session, assessment, None, top_n=5):
            deck = next(
                (
                    d
                    for d in HISTORICAL_DECKS
                    if any(i.scenario_key == match.scenario_key for i in d.incidents)
                ),
                None,
            )
            incident = (
                next((i for i in deck.incidents if i.scenario_key == match.scenario_key), None)
                if deck
                else None
            )
            if incident is None:
                continue
            entity = build_historical_incident_entity(
                incident, title=match.incident_name, outcome_tier=match.outcome_tier
            )
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.MATCHED,
                        EntityKind.HISTORICAL_INCIDENT,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        scenario_key = _resolve_scenario_key(assessment.zone_id, assessment.timestamp)
        if scenario_key is not None:
            forecast_entity = build_forecast_entity(
                assessment.zone_id, assessment.timestamp, scenario_key
            )
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.PROJECTS_FOR,
                        EntityKind.FORECAST,
                        forecast_entity.id,
                        forecast_entity.label,
                    ),
                    forecast_entity,
                )
            )

        counterfactual_entity = self._build_counterfactual(assessment.zone_id, assessment.timestamp)
        if counterfactual_entity is not None:
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.RISK_ASSESSMENT,
                        entity_id,
                        RelationKind.REFERENCES,
                        EntityKind.COUNTERFACTUAL,
                        counterfactual_entity.id,
                        counterfactual_entity.label,
                    ),
                    counterfactual_entity,
                )
            )

        return neighbors

    def _neighbors_of_triggered_agent(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        parsed = parse_triggered_agent_id(entity_id)
        if parsed is None:
            return []
        assessment_id_str, agent_name = parsed
        assessment = RiskAssessmentRepository(session).get(uuid.UUID(assessment_id_str))
        if assessment is None:
            return []
        neighbors: list[tuple[GraphEdge, GraphEntity]] = [
            (
                GraphEdge(
                    EntityKind.TRIGGERED_AGENT,
                    entity_id,
                    RelationKind.TRIGGERED,
                    EntityKind.RISK_ASSESSMENT,
                    str(assessment.assessment_id),
                    build_risk_assessment_entity(assessment).label,
                ),
                build_risk_assessment_entity(assessment),
            )
        ]
        if agent_name == "gas_risk":
            for sensor in SensorRepository(session).list_by_zone(assessment.zone_id):
                entity = build_sensor_entity(sensor)
                neighbors.append(
                    (
                        GraphEdge(
                            EntityKind.TRIGGERED_AGENT,
                            entity_id,
                            RelationKind.EVIDENCE,
                            EntityKind.SENSOR,
                            entity.id,
                            entity.label,
                        ),
                        entity,
                    )
                )
        return neighbors

    def _neighbors_of_recommendation(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        parsed = parse_recommendation_id(entity_id)
        if parsed is None:
            return []
        assessment_id_str, recommendation_key = parsed
        assessment = RiskAssessmentRepository(session).get(uuid.UUID(assessment_id_str))
        if assessment is None:
            return []
        assessment_entity = build_risk_assessment_entity(assessment)
        neighbors: list[tuple[GraphEdge, GraphEntity]] = [
            (
                GraphEdge(
                    EntityKind.RECOMMENDATION,
                    entity_id,
                    RelationKind.GENERATED,
                    EntityKind.RISK_ASSESSMENT,
                    assessment_entity.id,
                    assessment_entity.label,
                ),
                assessment_entity,
            )
        ]
        owning_agent = _rule_owning_agent(recommendation_key)
        if owning_agent is not None:
            contribution = _agent_contributions(assessment).get(owning_agent)
            if isinstance(contribution, dict):
                entity = build_triggered_agent_entity(
                    assessment.assessment_id, owning_agent, contribution
                )
                neighbors.append(
                    (
                        GraphEdge(
                            EntityKind.RECOMMENDATION,
                            entity_id,
                            RelationKind.ADDRESSES,
                            EntityKind.TRIGGERED_AGENT,
                            entity.id,
                            entity.label,
                        ),
                        entity,
                    )
                )
        return neighbors

    def _neighbors_of_historical_incident(
        self, entity_id: str
    ) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        deck = next(
            (d for d in HISTORICAL_DECKS if any(i.scenario_key == entity_id for i in d.incidents)),
            None,
        )
        if deck is None:
            return []
        incident = next(i for i in deck.incidents if i.scenario_key == entity_id)
        ticks = [t for t in _build_index_for_deck(session, deck) if t.incident is incident]
        if not ticks:
            return []

        rules: list[str] = []
        for tick in ticks:
            for rule in _rules_fired(tick.assessment):
                if rule not in rules:
                    rules.append(rule)

        neighbors: list[tuple[GraphEdge, GraphEntity]] = []
        for lesson in lessons_for_rules(rules):
            entity = build_lesson_entity(lesson)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.HISTORICAL_INCIDENT,
                        entity_id,
                        RelationKind.LEARNED_FROM,
                        EntityKind.LESSON_LEARNED,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        this_zone_id = ticks[0].zone_id
        this_outcome = _outcome_tier(session, incident, this_zone_id)
        this_rule_set = set(rules)
        for other_deck in HISTORICAL_DECKS:
            for other_incident in other_deck.incidents:
                if other_incident.scenario_key == entity_id:
                    continue
                other_ticks = [
                    t
                    for t in _build_index_for_deck(session, other_deck)
                    if t.incident is other_incident
                ]
                if not other_ticks:
                    continue
                other_zone_id = other_ticks[0].zone_id
                other_outcome = _outcome_tier(session, other_incident, other_zone_id)
                other_rules = {rule for t in other_ticks for rule in _rules_fired(t.assessment)}

                summary = get_scenario_summary(other_incident.scenario_key)
                entity = build_historical_incident_entity(
                    other_incident,
                    title=summary.title if summary else None,
                    outcome_tier=other_outcome,
                )
                if other_outcome == this_outcome:
                    neighbors.append(
                        (
                            GraphEdge(
                                EntityKind.HISTORICAL_INCIDENT,
                                entity_id,
                                RelationKind.SAME_OUTCOME,
                                EntityKind.HISTORICAL_INCIDENT,
                                entity.id,
                                entity.label,
                            ),
                            entity,
                        )
                    )
                if this_rule_set & other_rules:
                    neighbors.append(
                        (
                            GraphEdge(
                                EntityKind.HISTORICAL_INCIDENT,
                                entity_id,
                                RelationKind.SAME_TRIGGERED_RULE,
                                EntityKind.HISTORICAL_INCIDENT,
                                entity.id,
                                entity.label,
                            ),
                            entity,
                        )
                    )
        return neighbors

    def _neighbors_of_forecast(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        from src.foresight.service import generate_operational_foresight

        session = self._session
        parsed = parse_zone_timestamp_id(entity_id)
        if parsed is None:
            return []
        zone_id = uuid.UUID(parsed[0])
        timestamp = datetime.fromisoformat(parsed[1])
        scenario_key = _resolve_scenario_key(zone_id, timestamp)
        if scenario_key is None:
            return []

        assessment = RiskAssessmentRepository(session).get_by_zone_and_timestamp(zone_id, timestamp)
        if assessment is None:
            return []

        neighbors: list[tuple[GraphEdge, GraphEntity]] = []
        assessment_entity = build_risk_assessment_entity(assessment)
        neighbors.append(
            (
                GraphEdge(
                    EntityKind.FORECAST,
                    entity_id,
                    RelationKind.PROJECTS_FOR,
                    EntityKind.RISK_ASSESSMENT,
                    assessment_entity.id,
                    assessment_entity.label,
                ),
                assessment_entity,
            )
        )
        for template in recommendation_templates_for(assessment.tier, _rules_fired(assessment)):
            entity = build_recommendation_entity(assessment.assessment_id, template)
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.FORECAST,
                        entity_id,
                        RelationKind.CO_OCCURS_WITH,
                        EntityKind.RECOMMENDATION,
                        entity.id,
                        entity.label,
                    ),
                    entity,
                )
            )

        recent = RiskAssessmentRepository(session).history_by_zone(
            zone_id, limit=_RECENT_ASSESSMENT_LIMIT - 1, before=timestamp, after=None
        )
        window = [*reversed(recent), assessment]
        result = generate_operational_foresight(
            session, zone_id, scenario_key, window, window_size=_RECENT_ASSESSMENT_LIMIT
        )
        for match in result.matches:
            deck = next(
                (
                    d
                    for d in HISTORICAL_DECKS
                    if any(i.scenario_key == match.trajectory.scenario_key for i in d.incidents)
                ),
                None,
            )
            incident = (
                next(
                    (i for i in deck.incidents if i.scenario_key == match.trajectory.scenario_key),
                    None,
                )
                if deck
                else None
            )
            if incident is None:
                continue
            summary = get_scenario_summary(incident.scenario_key)
            entity = build_historical_incident_entity(
                incident, title=summary.title if summary else None
            )
            neighbors.append(
                (
                    GraphEdge(
                        EntityKind.HISTORICAL_INCIDENT,
                        entity.id,
                        RelationKind.SUPPORTS,
                        EntityKind.FORECAST,
                        entity_id,
                        "supports this forecast",
                    ),
                    entity,
                )
            )
        return neighbors

    def _neighbors_of_lesson(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        session = self._session
        neighbors: list[tuple[GraphEdge, GraphEntity]] = []
        for deck in HISTORICAL_DECKS:
            for incident in deck.incidents:
                ticks = [t for t in _build_index_for_deck(session, deck) if t.incident is incident]
                rules = {rule for t in ticks for rule in _rules_fired(t.assessment)}
                if entity_id not in rules:
                    continue
                summary = get_scenario_summary(incident.scenario_key)
                entity = build_historical_incident_entity(
                    incident, title=summary.title if summary else None
                )
                neighbors.append(
                    (
                        GraphEdge(
                            EntityKind.LESSON_LEARNED,
                            entity_id,
                            RelationKind.LEARNED_FROM,
                            EntityKind.HISTORICAL_INCIDENT,
                            entity.id,
                            entity.label,
                        ),
                        entity,
                    )
                )
        return neighbors

    def _neighbors_of_counterfactual(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        parsed = parse_zone_timestamp_id(entity_id)
        if parsed is None:
            return []
        zone_id = uuid.UUID(parsed[0])
        timestamp = datetime.fromisoformat(parsed[1])
        assessment = RiskAssessmentRepository(self._session).get_by_zone_and_timestamp(
            zone_id, timestamp
        )
        if assessment is None:
            return []
        entity = build_risk_assessment_entity(assessment)
        return [
            (
                GraphEdge(
                    EntityKind.COUNTERFACTUAL,
                    entity_id,
                    RelationKind.REFERENCES,
                    EntityKind.RISK_ASSESSMENT,
                    entity.id,
                    entity.label,
                ),
                entity,
            )
        ]

    def _neighbors_of_business_impact(self, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        parsed = parse_business_impact_id(entity_id)
        if parsed is None:
            return []
        _sub_kind, zone_id_str, timestamp_str = parsed
        zone_id = uuid.UUID(zone_id_str)
        timestamp = datetime.fromisoformat(timestamp_str)
        assessment = RiskAssessmentRepository(self._session).get_by_zone_and_timestamp(
            zone_id, timestamp
        )
        if assessment is None:
            return []
        entity = build_risk_assessment_entity(assessment)
        return [
            (
                GraphEdge(
                    EntityKind.BUSINESS_IMPACT,
                    entity_id,
                    RelationKind.IMPACT_OF,
                    EntityKind.RISK_ASSESSMENT,
                    entity.id,
                    entity.label,
                ),
                entity,
            )
        ]

    # -- subgraph / search / path ------------------------------------

    def get_subgraph(
        self, kind: str, entity_id: str, depth: int = 1, max_nodes: int = _MAX_SUBGRAPH_NODES
    ) -> tuple[list[GraphEntity], list[GraphEdge]]:
        """Bounded breadth-first expansion - never the whole graph.
        Stops as soon as either `depth` hops or `max_nodes` distinct
        nodes is reached, whichever comes first."""
        root = self.get_entity(kind, entity_id)
        if root is None:
            return [], []

        nodes: dict[tuple[str, str], GraphEntity] = {(root.kind, root.id): root}
        edges: list[GraphEdge] = []
        frontier: list[tuple[str, str]] = [(root.kind, root.id)]

        for _ in range(depth):
            if len(nodes) >= max_nodes:
                break
            next_frontier: list[tuple[str, str]] = []
            for frontier_kind, frontier_id in frontier:
                if len(nodes) >= max_nodes:
                    break
                for edge, neighbor in self.get_neighbors(frontier_kind, frontier_id):
                    edges.append(edge)
                    key = (neighbor.kind, neighbor.id)
                    if key not in nodes:
                        if len(nodes) >= max_nodes:
                            continue
                        nodes[key] = neighbor
                        next_frontier.append(key)
            frontier = next_frontier

        return list(nodes.values()), edges

    def search(self, query: str, limit: int = 20) -> list[GraphEntity]:
        """Substring match (case-insensitive) over label/attribute
        text across the queryable entity kinds - zones, sensors,
        workers, equipment, permits, historical incidents, lessons.
        Deliberately does not search RiskAssessment/TriggeredAgent/
        Recommendation/Forecast/Counterfactual/BusinessImpact, which
        are per-tick and would make "search" scan unbounded history;
        those are reached by navigation, not search."""
        session = self._session
        needle = query.strip().lower()
        if not needle:
            return []

        results: list[GraphEntity] = []

        for zone in ZoneRepository(session).list_all():
            entity = build_zone_entity(zone)
            if needle in zone.name.lower() or needle in zone.plant_section.lower():
                results.append(entity)
            for sensor in SensorRepository(session).list_by_zone(zone.zone_id):
                sensor_entity = build_sensor_entity(sensor)
                if needle in sensor.gas_type.lower():
                    results.append(sensor_entity)
            for worker in WorkerRepository(session).list_by_current_zone(zone.zone_id):
                if needle in worker.role.lower():
                    results.append(build_worker_entity(worker))
            for equipment in EquipmentRepository(session).list_by_zone(zone.zone_id):
                if needle in equipment.equipment_type.lower():
                    results.append(build_equipment_entity(equipment))
            if len(results) >= limit:
                return results[:limit]

        for deck in HISTORICAL_DECKS:
            for incident in deck.incidents:
                summary = get_scenario_summary(incident.scenario_key)
                title = summary.title if summary else incident.scenario_key
                if needle in title.lower() or needle in incident.scenario_key.lower():
                    results.append(build_historical_incident_entity(incident, title=title))
                if len(results) >= limit:
                    return results[:limit]

        return results[:limit]

    def get_path(
        self, source_kind: str, source_id: str, target_kind: str, target_id: str, max_depth: int = 6
    ) -> list[GraphEdge] | None:
        """Deterministic BFS shortest path - the "why" chain (Parts
        7/8/13). Returns the edge sequence connecting source to
        target, or None if no path exists within `max_depth` hops."""
        start = (source_kind, source_id)
        goal = (target_kind, target_id)
        if start == goal:
            return []

        visited: set[tuple[str, str]] = {start}
        parent: dict[tuple[str, str], tuple[tuple[str, str], GraphEdge]] = {}
        frontier: list[tuple[str, str]] = [start]

        for _ in range(max_depth):
            next_frontier: list[tuple[str, str]] = []
            for node in frontier:
                for edge, neighbor in self.get_neighbors(node[0], node[1]):
                    key = (neighbor.kind, neighbor.id)
                    if key in visited:
                        continue
                    visited.add(key)
                    parent[key] = (node, edge)
                    if key == goal:
                        path: list[GraphEdge] = []
                        cursor = key
                        while cursor != start:
                            prev, edge_taken = parent[cursor]
                            path.append(edge_taken)
                            cursor = prev
                        path.reverse()
                        return path
                    next_frontier.append(key)
            frontier = next_frontier
            if not frontier:
                break

        return None


__all__ = ["GraphService"]
