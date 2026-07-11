"""Unit tests for src/foresight/confidence.py - pure arithmetic, no
database, hand-computed expected values.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.foresight.confidence import compute_confidence
from src.foresight.forecast import ForecastEvidence, ForecastPoint
from src.foresight.matching import TrajectoryMatch
from src.foresight.trajectory import Trajectory


def make_match(similarity: float) -> TrajectoryMatch:
    trajectory = Trajectory(scenario_key="s", incident=None, zone_id=uuid.uuid4(), steps=())
    return TrajectoryMatch(
        trajectory=trajectory, anchor_index=0, similarity=similarity, window_length=1
    )


def make_evidence(observed_risk: float) -> ForecastEvidence:
    return ForecastEvidence(
        scenario_key="s",
        zone_id=uuid.uuid4(),
        similarity=0.5,
        observed_risk=observed_risk,
        observed_tier="watch",
        observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        minutes_after_anchor=15.0,
    )


def test_data_completeness_is_ratio_of_available_to_requested_capped_at_one() -> None:
    confidence = compute_confidence(
        current_window_length=3, requested_window_size=5, matches=[], forecast_points=[]
    )
    assert confidence.data_completeness == 0.6

    full = compute_confidence(
        current_window_length=10, requested_window_size=5, matches=[], forecast_points=[]
    )
    assert full.data_completeness == 1.0


def test_trajectory_similarity_is_mean_of_match_similarities() -> None:
    matches = [make_match(0.8), make_match(0.4)]
    confidence = compute_confidence(
        current_window_length=5, requested_window_size=5, matches=matches, forecast_points=[]
    )
    assert confidence.trajectory_similarity == pytest.approx(0.6)


def test_historical_agreement_is_zero_with_fewer_than_two_evidence_items() -> None:
    point = ForecastPoint(
        horizon_minutes=15,
        projected_risk=50.0,
        projected_tier="watch",
        evidence=[make_evidence(50.0)],
        unavailable_reason=None,
    )
    confidence = compute_confidence(
        current_window_length=5,
        requested_window_size=5,
        matches=[make_match(0.5)],
        forecast_points=[point],
    )
    assert confidence.historical_agreement == 0.0


def test_historical_agreement_is_high_when_evidence_values_are_close() -> None:
    point = ForecastPoint(
        horizon_minutes=15,
        projected_risk=50.0,
        projected_tier="watch",
        evidence=[make_evidence(50.0), make_evidence(51.0)],
        unavailable_reason=None,
    )
    confidence = compute_confidence(
        current_window_length=5,
        requested_window_size=5,
        matches=[make_match(0.5), make_match(0.5)],
        forecast_points=[point],
    )
    assert confidence.historical_agreement > 0.99


def test_replay_coverage_is_fraction_of_covered_match_horizon_pairs() -> None:
    covered_point = ForecastPoint(
        horizon_minutes=15,
        projected_risk=50.0,
        projected_tier="watch",
        evidence=[make_evidence(50.0), make_evidence(50.0)],
        unavailable_reason=None,
    )
    uncovered_point = ForecastPoint(
        horizon_minutes=30,
        projected_risk=None,
        projected_tier=None,
        evidence=[],
        unavailable_reason="unavailable",
    )
    matches = [make_match(0.5), make_match(0.5)]
    confidence = compute_confidence(
        current_window_length=5,
        requested_window_size=5,
        matches=matches,
        forecast_points=[covered_point, uncovered_point],
    )
    # 2 matches * 2 horizons = 4 possible; 2 covered -> 0.5
    assert confidence.replay_coverage == 0.5


def test_overall_is_the_minimum_of_the_four_factors_never_an_average() -> None:
    point = ForecastPoint(
        horizon_minutes=15,
        projected_risk=50.0,
        projected_tier="watch",
        evidence=[make_evidence(50.0), make_evidence(50.0)],
        unavailable_reason=None,
    )
    confidence = compute_confidence(
        current_window_length=1,
        requested_window_size=5,  # data_completeness = 0.2, the weakest factor
        matches=[make_match(0.9), make_match(0.9)],
        forecast_points=[point],
    )
    assert confidence.overall == confidence.data_completeness
    assert confidence.overall < confidence.trajectory_similarity


def test_no_matches_produces_zero_confidence_everywhere() -> None:
    confidence = compute_confidence(
        current_window_length=0, requested_window_size=5, matches=[], forecast_points=[]
    )
    assert confidence.trajectory_similarity == 0.0
    assert confidence.replay_coverage == 0.0
    assert confidence.overall == 0.0
