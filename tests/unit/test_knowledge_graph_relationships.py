"""Unit tests for src/knowledge_graph/relationships.py - the
documented relationship catalog is complete and well-formed."""

from src.knowledge_graph.relationships import RELATIONSHIP_CATALOG, GraphEdge, RelationKind


def test_every_catalog_entry_has_the_required_keys() -> None:
    required_keys = {"source", "relation", "target", "evidence"}
    for entry in RELATIONSHIP_CATALOG:
        assert required_keys.issubset(entry.keys())


def test_every_catalog_entry_relation_is_a_real_relation_kind_constant() -> None:
    valid_relations = {
        value for name, value in vars(RelationKind).items() if not name.startswith("_")
    }
    for entry in RELATIONSHIP_CATALOG:
        assert entry["relation"] in valid_relations


def test_every_catalog_entry_has_non_empty_evidence() -> None:
    for entry in RELATIONSHIP_CATALOG:
        assert isinstance(entry["evidence"], str)
        assert len(entry["evidence"]) > 0


def test_forecast_to_recommendation_edge_is_labeled_co_occurs_with_not_generated() -> None:
    """M25's hard rule: Foresight must never appear to influence a
    recommendation, even at the documentation/presentation layer."""
    forecast_to_recommendation = [
        entry
        for entry in RELATIONSHIP_CATALOG
        if entry["source"] == "Forecast" and entry["target"] == "Recommendation"
    ]
    assert len(forecast_to_recommendation) == 1
    assert forecast_to_recommendation[0]["relation"] == RelationKind.CO_OCCURS_WITH


def test_graph_edge_is_a_plain_directed_edge() -> None:
    edge = GraphEdge("zone", "z1", RelationKind.CONTAINS, "sensor", "s1", "contains sensor")
    assert edge.source_kind == "zone"
    assert edge.target_kind == "sensor"
    assert edge.relation == RelationKind.CONTAINS
