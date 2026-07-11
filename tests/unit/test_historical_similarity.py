"""Unit tests for src/historical/similarity.py - pure arithmetic, no
database, hand-computed expected values per the project's standing
"validate with independently hand-computed sequences" discipline.
"""

from src.historical.feature_vector import FeatureVector
from src.historical.similarity import (
    matching_and_differing_features,
    similarity_score,
    weighted_euclidean_distance,
)


def vector(
    gas_risk: float = 0.0,
    equipment_risk: float = 0.0,
    worker_risk: float = 0.0,
    permit_risk: float = 0.0,
    compound_risk_score: float = 0.0,
    confidence: float = 1.0,
    tier_ordinal: int = 0,
    interaction_bonus: float = 1.0,
    triggered_agent_count: int = 0,
    trend: int = 0,
    triggered_agents: frozenset[str] = frozenset(),
) -> FeatureVector:
    return FeatureVector(
        gas_risk=gas_risk,
        equipment_risk=equipment_risk,
        worker_risk=worker_risk,
        permit_risk=permit_risk,
        compound_risk_score=compound_risk_score,
        confidence=confidence,
        tier_ordinal=tier_ordinal,
        interaction_bonus=interaction_bonus,
        triggered_agent_count=triggered_agent_count,
        trend=trend,
        triggered_agents=triggered_agents,
    )


def test_identical_vectors_have_zero_distance_and_similarity_one() -> None:
    a = vector(gas_risk=50.0, compound_risk_score=60.0, tier_ordinal=2)
    b = vector(gas_risk=50.0, compound_risk_score=60.0, tier_ordinal=2)
    result = similarity_score(a, b)
    assert result.distance == 0.0
    assert result.similarity == 1.0


def test_distance_is_symmetric() -> None:
    a = vector(gas_risk=10.0, compound_risk_score=20.0)
    b = vector(gas_risk=90.0, compound_risk_score=95.0)
    assert weighted_euclidean_distance(a, b) == weighted_euclidean_distance(b, a)


def test_similarity_strictly_decreases_as_distance_grows() -> None:
    base = vector(compound_risk_score=50.0)
    close = vector(compound_risk_score=55.0)
    far = vector(compound_risk_score=95.0)
    close_similarity = similarity_score(base, close).similarity
    far_similarity = similarity_score(base, far).similarity
    assert 0.0 < far_similarity < close_similarity < 1.0


def test_similarity_never_leaves_the_zero_to_one_range() -> None:
    a = vector(
        gas_risk=100.0,
        equipment_risk=100.0,
        worker_risk=100.0,
        permit_risk=100.0,
        compound_risk_score=100.0,
    )
    b = vector(
        gas_risk=0.0, equipment_risk=0.0, worker_risk=0.0, permit_risk=0.0, compound_risk_score=0.0
    )
    result = similarity_score(a, b)
    assert 0.0 < result.similarity < 1.0


def test_compound_risk_score_weighted_more_than_confidence() -> None:
    """FEATURE_WEIGHTS gives compound_risk_score 1.5x and confidence
    0.5x - so an equal-sized gap (10 units, after confidence's *100
    rescale) registers as a bigger distance when it's in compound
    score than when it's in confidence."""
    base = vector(compound_risk_score=50.0, confidence=0.9)
    compound_gap = vector(compound_risk_score=60.0, confidence=0.9)  # +10 in compound_risk_score
    confidence_gap = vector(
        compound_risk_score=50.0, confidence=0.8
    )  # +10 in confidence*100 rescale
    assert weighted_euclidean_distance(base, compound_gap) > weighted_euclidean_distance(
        base, confidence_gap
    )


def test_matching_and_differing_features_numeric_tolerance() -> None:
    a = vector(gas_risk=50.0, compound_risk_score=60.0)
    b = vector(gas_risk=52.0, compound_risk_score=90.0)
    matching, differing = matching_and_differing_features(a, b, tolerance=10.0)
    assert "gas_risk" in matching
    assert "compound_risk_score" in differing


def test_matching_and_differing_features_triggered_agents_by_set_membership() -> None:
    a = vector(triggered_agents=frozenset({"gas_risk", "permit_intelligence"}))
    b = vector(triggered_agents=frozenset({"gas_risk"}))
    matching, differing = matching_and_differing_features(a, b)
    assert "triggered:gas_risk" in matching
    assert "triggered:permit_intelligence" in differing


def test_matching_and_differing_features_operational_status_and_interaction_bonus() -> None:
    a = vector(tier_ordinal=2, interaction_bonus=1.4)
    b = vector(tier_ordinal=2, interaction_bonus=1.0)
    matching, differing = matching_and_differing_features(a, b)
    assert "operational_status" in matching
    assert "interaction_bonus" in differing
