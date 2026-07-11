"""Unit tests for src/knowledge_graph/recommendation_text.py - the
mirrored lookup table's derivation order/dedup logic must match
`frontend/src/lib/recommendations.ts::deriveRecommendations` exactly.
"""

from src.knowledge_graph.recommendation_text import (
    RULE_RECOMMENDATIONS,
    TIER_BASELINE,
    recommendation_templates_for,
)


def test_normal_tier_has_no_baseline_recommendation() -> None:
    templates = recommendation_templates_for("normal", [])
    assert templates == []


def test_tier_baseline_comes_first() -> None:
    templates = recommendation_templates_for("critical", ["unauthorized_presence"])
    assert templates[0].id == "tier_critical"
    assert templates[1].id == "unauthorized_presence"


def test_unrecognized_rule_ids_are_silently_skipped() -> None:
    templates = recommendation_templates_for("watch", ["some_unknown_rule_id"])
    assert templates == [TIER_BASELINE["watch"]]


def test_duplicate_rule_ids_are_deduplicated() -> None:
    templates = recommendation_templates_for(
        "elevated", ["unauthorized_presence", "unauthorized_presence"]
    )
    ids = [t.id for t in templates]
    assert ids.count("unauthorized_presence") == 1


def test_all_nine_rule_recommendations_have_a_valid_severity() -> None:
    for template in RULE_RECOMMENDATIONS.values():
        assert template.severity in ("critical", "high", "medium")
    assert len(RULE_RECOMMENDATIONS) == 9


def test_rules_fire_in_order_not_dict_order() -> None:
    templates = recommendation_templates_for(
        "watch", ["interaction_bonus_applied", "permit_status_escalated"]
    )
    ids = [t.id for t in templates if t.id != "tier_watch"]
    assert ids == ["interaction_bonus_applied", "permit_status_escalated"]
