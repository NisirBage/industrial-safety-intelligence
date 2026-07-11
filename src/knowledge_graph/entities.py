"""M26 Part 1 (Graph Model) - the 15 entity kinds this platform's
Operational Knowledge Graph can show, and the deterministic id
scheme each one uses. Every id is either a real primary key already
in use elsewhere (zone_id, sensor_id, worker_id, equipment_id,
permit_id, assessment_id, scenario_key) or a documented deterministic
composite of real ids (never a random one) - so the same entity
always resolves to the same graph node, and a node id can always be
traced back to the real row(s) it came from.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


class EntityKind:
    """The complete, closed set of node kinds this graph renders -
    exactly the 15 the milestone names. No sixteenth kind is
    introduced anywhere in this package."""

    PLANT = "plant"
    ZONE = "zone"
    SENSOR = "sensor"
    SENSOR_READING = "sensor_reading"
    WORKER = "worker"
    EQUIPMENT = "equipment"
    PERMIT = "permit"
    RISK_ASSESSMENT = "risk_assessment"
    TRIGGERED_AGENT = "triggered_agent"
    RECOMMENDATION = "recommendation"
    HISTORICAL_INCIDENT = "historical_incident"
    FORECAST = "forecast"
    LESSON_LEARNED = "lesson_learned"
    COUNTERFACTUAL = "counterfactual"
    BUSINESS_IMPACT = "business_impact"

    ALL: tuple[str, ...] = (
        PLANT,
        ZONE,
        SENSOR,
        SENSOR_READING,
        WORKER,
        EQUIPMENT,
        PERMIT,
        RISK_ASSESSMENT,
        TRIGGERED_AGENT,
        RECOMMENDATION,
        HISTORICAL_INCIDENT,
        FORECAST,
        LESSON_LEARNED,
        COUNTERFACTUAL,
        BUSINESS_IMPACT,
    )


#: There is no "Plant" table anywhere in this codebase (confirmed by
#: grep across `src/`) - this platform models zones directly, on one
#: simulated site. Rather than invent a Plant entity with fabricated
#: attributes, the graph's single Plant node is a synthetic
#: organizational root with a fixed id, labeled with the one real
#: site-identity string that does exist (`Settings.app_name`).
PLANT_ID = "plant"


@dataclass(frozen=True)
class GraphEntity:
    """One node. `attributes` holds only values copied verbatim from
    an already-computed field on a real row or dataclass - this
    package never derives a new one."""

    kind: str
    id: str
    label: str
    attributes: dict[str, Any] = field(default_factory=dict)


#: Composite ids join their parts with `|`, never `:` - an ISO-8601
#: timestamp (`2026-07-01T08:05:00+00:00`) already contains `:`, so a
#: `:`-joined id could not be split back into its parts unambiguously.
#: `|` appears in neither a UUID, a scenario_key, nor an ISO timestamp.
_ID_SEPARATOR = "|"


def triggered_agent_id(assessment_id: uuid.UUID, agent_name: str) -> str:
    """Deterministic composite id - one TriggeredAgent node per
    (assessment, agent) pair, since `agent_contributions` is keyed
    that way on the real persisted `RiskAssessment.justification`."""
    return f"{assessment_id}{_ID_SEPARATOR}{agent_name}"


def parse_triggered_agent_id(node_id: str) -> tuple[str, str] | None:
    parts = node_id.split(_ID_SEPARATOR)
    return (parts[0], parts[1]) if len(parts) == 2 else None


def recommendation_id(assessment_id: uuid.UUID, recommendation_key: str) -> str:
    """Deterministic composite id - one Recommendation node per
    (assessment, recommendation-key) pair, where `recommendation_key`
    is the same `id` field `frontend/src/lib/recommendations.ts`'s
    `deriveRecommendations` already assigns (a tier-baseline id or a
    rule id) - see `recommendation_text.py`."""
    return f"{assessment_id}{_ID_SEPARATOR}{recommendation_key}"


def parse_recommendation_id(node_id: str) -> tuple[str, str] | None:
    parts = node_id.split(_ID_SEPARATOR)
    return (parts[0], parts[1]) if len(parts) == 2 else None


def forecast_id(zone_id: uuid.UUID, timestamp: datetime) -> str:
    """One Forecast node per (zone, tick) - the same key
    `GET /foresight/forecast` already takes as its query parameters."""
    return f"{zone_id}{_ID_SEPARATOR}{timestamp.isoformat()}"


def parse_zone_timestamp_id(node_id: str) -> tuple[str, str] | None:
    """Shared parser for `forecast_id`/`counterfactual_id` - both are
    a plain (zone_id, timestamp) pair."""
    parts = node_id.split(_ID_SEPARATOR)
    return (parts[0], parts[1]) if len(parts) == 2 else None


def counterfactual_id(zone_id: uuid.UUID, timestamp: datetime) -> str:
    """One Counterfactual node per (zone, tick) - the same key
    `GET /counterfactual/{zone_id}` already takes."""
    return f"{zone_id}{_ID_SEPARATOR}{timestamp.isoformat()}"


def business_impact_id(kind: str, zone_id: uuid.UUID, timestamp: datetime) -> str:
    """One BusinessImpact node per (sub-kind, zone, tick) - `kind` is
    one of `BUSINESS_IMPACT_SUB_KINDS` below."""
    return f"{kind}{_ID_SEPARATOR}{zone_id}{_ID_SEPARATOR}{timestamp.isoformat()}"


def parse_business_impact_id(node_id: str) -> tuple[str, str, str] | None:
    parts = node_id.split(_ID_SEPARATOR)
    return (parts[0], parts[1], parts[2]) if len(parts) == 3 else None


#: The seven executive sub-categories Part 12 names. Four have real
#: backing data in this platform; three do not exist anywhere in the
#: real data model and are represented as honest `Unavailable` nodes
#: (see `builders.py`) rather than a fabricated number - the same
#: "Status: Unavailable" discipline this platform already established
#: at M24 for "most effective interventions"/"industry comparisons".
BUSINESS_IMPACT_SUB_KINDS: tuple[str, ...] = (
    "business_impact",  # real - qualitative, from RiskAssessment.tier
    "operational_stability",  # real - from ForesightResult.early_warning.category
    "workers_affected",  # real - from WorkerRepository.list_by_current_zone count
    "permit_impact",  # real - from PermitRepository open/flagged permits for the zone
    "downtime",  # Unavailable - no downtime-tracking mechanic exists in this platform
    "financial_exposure",  # Unavailable - no financial model exists in this platform
    "environmental_exposure",  # Unavailable - no environmental-exposure metric exists
)

#: Of the seven, exactly these have real data behind them.
BUSINESS_IMPACT_AVAILABLE_KINDS: frozenset[str] = frozenset(
    {"business_impact", "operational_stability", "workers_affected", "permit_impact"}
)


__all__ = [
    "EntityKind",
    "PLANT_ID",
    "GraphEntity",
    "triggered_agent_id",
    "parse_triggered_agent_id",
    "recommendation_id",
    "parse_recommendation_id",
    "forecast_id",
    "counterfactual_id",
    "parse_zone_timestamp_id",
    "business_impact_id",
    "parse_business_impact_id",
    "BUSINESS_IMPACT_SUB_KINDS",
    "BUSINESS_IMPACT_AVAILABLE_KINDS",
]
