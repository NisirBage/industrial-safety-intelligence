"""Unit tests for src/knowledge_graph/entities.py - pure functions, no
database.
"""

import uuid
from datetime import UTC, datetime

from src.knowledge_graph.entities import (
    BUSINESS_IMPACT_AVAILABLE_KINDS,
    BUSINESS_IMPACT_SUB_KINDS,
    EntityKind,
    business_impact_id,
    counterfactual_id,
    forecast_id,
    parse_business_impact_id,
    parse_recommendation_id,
    parse_triggered_agent_id,
    parse_zone_timestamp_id,
    recommendation_id,
    triggered_agent_id,
)


def test_entity_kind_all_has_exactly_the_fifteen_named_kinds() -> None:
    assert len(EntityKind.ALL) == 15
    assert len(set(EntityKind.ALL)) == 15  # no duplicates


def test_triggered_agent_id_round_trips() -> None:
    assessment_id = uuid.uuid4()
    node_id = triggered_agent_id(assessment_id, "gas_risk")
    parsed = parse_triggered_agent_id(node_id)
    assert parsed == (str(assessment_id), "gas_risk")


def test_recommendation_id_round_trips() -> None:
    assessment_id = uuid.uuid4()
    node_id = recommendation_id(assessment_id, "tier_critical")
    parsed = parse_recommendation_id(node_id)
    assert parsed == (str(assessment_id), "tier_critical")


def test_forecast_and_counterfactual_ids_round_trip_despite_colons_in_timestamp() -> None:
    zone_id = uuid.uuid4()
    # ISO timestamps contain ':' - the id scheme must not break on that.
    timestamp = datetime(2026, 7, 1, 8, 5, 0, tzinfo=UTC)

    fid = forecast_id(zone_id, timestamp)
    parsed = parse_zone_timestamp_id(fid)
    assert parsed == (str(zone_id), timestamp.isoformat())

    cid = counterfactual_id(zone_id, timestamp)
    assert parse_zone_timestamp_id(cid) == (str(zone_id), timestamp.isoformat())


def test_business_impact_id_round_trips_with_three_parts() -> None:
    zone_id = uuid.uuid4()
    timestamp = datetime(2026, 7, 1, 8, 5, 0, tzinfo=UTC)
    node_id = business_impact_id("workers_affected", zone_id, timestamp)
    parsed = parse_business_impact_id(node_id)
    assert parsed == ("workers_affected", str(zone_id), timestamp.isoformat())


def test_parse_functions_return_none_for_malformed_ids() -> None:
    assert parse_triggered_agent_id("not-a-composite-id") is None
    assert parse_recommendation_id("not-a-composite-id") is None
    assert parse_zone_timestamp_id("not-a-composite-id") is None
    assert parse_business_impact_id("only|two|parts|is-fine-but-this-has-four") is None


def test_business_impact_available_kinds_is_a_subset_of_sub_kinds() -> None:
    assert BUSINESS_IMPACT_AVAILABLE_KINDS.issubset(set(BUSINESS_IMPACT_SUB_KINDS))
    # Exactly 4 of the 7 sub-kinds have real backing data (Part 12).
    assert len(BUSINESS_IMPACT_AVAILABLE_KINDS) == 4
    assert len(BUSINESS_IMPACT_SUB_KINDS) == 7
