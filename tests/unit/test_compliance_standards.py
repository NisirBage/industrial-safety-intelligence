"""M27 Part 1 - the compliance reference table computes nothing and
never gates on risk/confidence/tier; these tests only check the data
itself is well-formed and correctly keyed."""

from src.compliance.standards import STANDARDS_FOR_RECOMMENDATION, standards_for_recommendation
from src.knowledge_graph.recommendation_text import RULE_RECOMMENDATIONS, TIER_BASELINE


def test_every_recommendation_id_has_at_least_one_standard() -> None:
    all_ids = {t.id for t in TIER_BASELINE.values()} | {t.id for t in RULE_RECOMMENDATIONS.values()}
    for recommendation_id in all_ids:
        assert len(standards_for_recommendation(recommendation_id)) >= 1, recommendation_id


def test_unrecognized_id_returns_empty_list_not_an_error() -> None:
    assert standards_for_recommendation("not_a_real_id") == []


def test_every_standard_has_all_fields_populated() -> None:
    for standards in STANDARDS_FOR_RECOMMENDATION.values():
        for standard in standards:
            assert standard.code
            assert standard.title
            assert standard.summary
            assert standard.applicability
            assert standard.external_reference


def test_company_sop_entries_are_honestly_labeled_internal() -> None:
    for standards in STANDARDS_FOR_RECOMMENDATION.values():
        for standard in standards:
            if standard.code == "Company SOP":
                assert "internal" in standard.applicability.lower()
                assert "not modeled" in standard.external_reference.lower()


def test_standards_for_recommendation_returns_a_copy_not_the_shared_list() -> None:
    original_length = len(STANDARDS_FOR_RECOMMENDATION["tier_critical"])
    result = standards_for_recommendation("tier_critical")
    result.append(result[0])
    assert len(STANDARDS_FOR_RECOMMENDATION["tier_critical"]) == original_length
    assert len(standards_for_recommendation("tier_critical")) == original_length
