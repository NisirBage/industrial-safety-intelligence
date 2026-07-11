"""M26 Part 2 (Relationships) - every edge kind this graph can draw,
and exactly which real data grounds it. Documented as a single
catalog (`RELATIONSHIP_CATALOG`) so every relationship's evidence
source is auditable in one place, per the milestone's own
"document every relationship" instruction.

Two relationship families the milestone's own example chains suggest
were deliberately NOT added, with the reason recorded here rather
than silently skipped:

- **"same industry" / "same equipment" / "same hazard" between
  Historical Incidents** (Part 9): this platform has exactly one
  simulated plant and one real historical deck (`src/historical/decks.py`
  - see M24's own "one honest deck" decision). Every incident is
  trivially the same industry and the same plant - that would not be a
  real discriminating relationship, it would be a constant. Instead,
  two relationships that *are* real and discriminating are provided:
  `SAME_OUTCOME` (both incidents reached the same worst tier) and
  `SAME_TRIGGERED_RULE` (both incidents fired at least one identical
  rule identifier).
- **Forecast -> Recommendation** (Part 10's example chain ends at
  "Recommendation"): this edge is real but is deliberately labeled
  `CO_OCCURS_WITH`, never `GENERATED` or `INFORMED` - Operational
  Foresight is architecturally forbidden from influencing a
  recommendation (M25's own hard rule), so the graph must not imply
  causality here even at the presentation layer. The edge exists only
  so a user can navigate from a forecast to the current tick's own,
  independently-generated recommendation.
"""

from __future__ import annotations

from dataclasses import dataclass


class RelationKind:
    CONTAINS = "contains"
    ADJACENT_TO = "adjacent_to"
    PRODUCED = "produced"
    AUTHORIZES = "authorizes"
    FOR_ZONE = "for_zone"
    ASSESSED_BY = "assessed_by"
    TRIGGERED = "triggered"
    EVIDENCE = "evidence"
    GENERATED = "generated"
    ADDRESSES = "addresses"
    MATCHED = "matched"
    SUPPORTS = "supports"
    PROJECTS_FOR = "projects_for"
    CO_OCCURS_WITH = "co_occurs_with"
    REFERENCES = "references"
    LEARNED_FROM = "learned_from"
    SAME_OUTCOME = "same_outcome"
    SAME_TRIGGERED_RULE = "same_triggered_rule"
    IMPACT_OF = "impact_of"


@dataclass(frozen=True)
class GraphEdge:
    """One directed edge. `relation` is always a `RelationKind`
    constant. Every edge is bidirectionally traversable via
    `GraphService.get_neighbors` regardless of which side "owns" the
    fact (e.g. `Permit.authorizing_officer_id` is the real column, but
    both Worker->Permit and Permit->Worker neighbor queries return the
    same real fact from either direction)."""

    source_kind: str
    source_id: str
    relation: str
    target_kind: str
    target_id: str
    label: str


#: One entry per distinct real fact this graph can show as an edge.
#: `evidence` names exactly which real column/field/function grounds
#: it - never a fabricated connection.
RELATIONSHIP_CATALOG: tuple[dict[str, str], ...] = (
    {
        "source": "Plant",
        "relation": RelationKind.CONTAINS,
        "target": "Zone",
        "evidence": "ZoneRepository.list_all() - every real zone row.",
    },
    {
        "source": "Zone",
        "relation": RelationKind.CONTAINS,
        "target": "Sensor",
        "evidence": "SensorRepository.list_by_zone(zone_id).",
    },
    {
        "source": "Zone",
        "relation": RelationKind.CONTAINS,
        "target": "Worker",
        "evidence": "WorkerRepository.list_by_current_zone(zone_id).",
    },
    {
        "source": "Zone",
        "relation": RelationKind.CONTAINS,
        "target": "Equipment",
        "evidence": "EquipmentRepository.list_by_zone(zone_id).",
    },
    {
        "source": "Zone",
        "relation": RelationKind.CONTAINS,
        "target": "Permit",
        "evidence": "PermitRepository.list_all(zone_id=zone_id, ...).",
    },
    {
        "source": "Zone",
        "relation": RelationKind.ADJACENT_TO,
        "target": "Zone",
        "evidence": "ZoneAdjacencyRepository.adjacent_zone_ids(zone_id).",
    },
    {
        "source": "Sensor",
        "relation": RelationKind.PRODUCED,
        "target": "SensorReading",
        "evidence": (
            "SensorReadingRepository.latest(zone_id, gas_type) - the sensor's own "
            "most recent real reading."
        ),
    },
    {
        "source": "Worker",
        "relation": RelationKind.AUTHORIZES,
        "target": "Permit",
        "evidence": "Permit.authorizing_officer_id == worker_id.",
    },
    {
        "source": "RiskAssessment",
        "relation": RelationKind.FOR_ZONE,
        "target": "Zone",
        "evidence": "RiskAssessment.zone_id.",
    },
    {
        "source": "Zone",
        "relation": RelationKind.ASSESSED_BY,
        "target": "RiskAssessment",
        "evidence": (
            "RiskAssessmentRepository.history_by_zone(zone_id, limit=N, ...) - "
            "bounded to the most recent N ticks, never the full history at once."
        ),
    },
    {
        "source": "RiskAssessment",
        "relation": RelationKind.TRIGGERED,
        "target": "TriggeredAgent",
        "evidence": (
            "RiskAssessment.justification['agent_contributions'] - one edge per "
            "agent with risk > 0."
        ),
    },
    {
        "source": "TriggeredAgent",
        "relation": RelationKind.EVIDENCE,
        "target": "Sensor",
        "evidence": (
            "The gas_risk TriggeredAgent's zone's own monitored Sensor "
            "(SensorRepository.list_by_zone) - the real signal that agent's "
            "context builder reads, never a claim about one specific reading."
        ),
    },
    {
        "source": "RiskAssessment",
        "relation": RelationKind.GENERATED,
        "target": "Recommendation",
        "evidence": (
            "The same (tier, rules_fired) -> recommendation-id lookup "
            "`frontend/src/lib/recommendations.ts::deriveRecommendations` already "
            "performs (mirrored, not reimplemented, in `recommendation_text.py`)."
        ),
    },
    {
        "source": "Recommendation",
        "relation": RelationKind.ADDRESSES,
        "target": "TriggeredAgent",
        "evidence": (
            "A recommendation's originating rule id belongs to the same agent "
            "whose contribution fired it."
        ),
    },
    {
        "source": "RiskAssessment",
        "relation": RelationKind.MATCHED,
        "target": "HistoricalIncident",
        "evidence": (
            "src.historical.knowledge_base.find_similar_incidents(...) - reused "
            "verbatim, never recomputed."
        ),
    },
    {
        "source": "HistoricalIncident",
        "relation": RelationKind.SUPPORTS,
        "target": "Forecast",
        "evidence": (
            "The incident's scenario_key appears among a Forecast's own "
            "ForecastEvidence citations (src.foresight.forecast.ForecastPoint.evidence)."
        ),
    },
    {
        "source": "Forecast",
        "relation": RelationKind.PROJECTS_FOR,
        "target": "RiskAssessment",
        "evidence": "The exact (zone_id, timestamp) a ForesightResult was computed for.",
    },
    {
        "source": "Forecast",
        "relation": RelationKind.CO_OCCURS_WITH,
        "target": "Recommendation",
        "evidence": (
            "Navigation only - the current tick's own, independently-generated "
            "Recommendation. Never GENERATED/INFORMED: Foresight cannot influence "
            "a recommendation (M25's hard rule)."
        ),
    },
    {
        "source": "Counterfactual",
        "relation": RelationKind.REFERENCES,
        "target": "RiskAssessment",
        "evidence": (
            "The exact (zone_id, timestamp) "
            "src.domain.orchestrator.counterfactual.evaluate() was run against."
        ),
    },
    {
        "source": "HistoricalIncident",
        "relation": RelationKind.LEARNED_FROM,
        "target": "LessonLearned",
        "evidence": (
            "src.historical.lessons.lessons_for_rules(rules_fired) over that "
            "incident's own indexed ticks' rules_fired."
        ),
    },
    {
        "source": "HistoricalIncident",
        "relation": RelationKind.SAME_OUTCOME,
        "target": "HistoricalIncident",
        "evidence": (
            "Both incidents' real worst-tier-reached "
            "(src.historical.knowledge_base's _outcome_tier) match."
        ),
    },
    {
        "source": "HistoricalIncident",
        "relation": RelationKind.SAME_TRIGGERED_RULE,
        "target": "HistoricalIncident",
        "evidence": (
            "Both incidents' indexed ticks share at least one identical real "
            "rules_fired identifier."
        ),
    },
    {
        "source": "BusinessImpact",
        "relation": RelationKind.IMPACT_OF,
        "target": "RiskAssessment",
        "evidence": (
            "The exact (zone_id, timestamp) a BusinessImpact sub-node was derived "
            "from (tier, worker count, permit status, or early-warning category) - "
            "or, for the three Unavailable sub-kinds, the tick that was asked "
            "about and found to have no real data."
        ),
    },
)


__all__ = ["RelationKind", "GraphEdge", "RELATIONSHIP_CATALOG"]
