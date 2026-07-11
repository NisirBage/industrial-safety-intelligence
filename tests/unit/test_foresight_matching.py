"""Unit tests for src/foresight/matching.py - pure functions, no
database.
"""

import uuid
from datetime import UTC, datetime, timedelta

from src.foresight.matching import match_trajectories
from src.foresight.trajectory import Trajectory, TrajectoryStep
from src.historical.feature_vector import FeatureVector


def vector(compound_risk_score: float) -> FeatureVector:
    return FeatureVector(
        gas_risk=0.0,
        equipment_risk=0.0,
        worker_risk=0.0,
        permit_risk=0.0,
        compound_risk_score=compound_risk_score,
        confidence=0.9,
        tier_ordinal=0,
        interaction_bonus=1.0,
        triggered_agent_count=0,
        trend=0,
    )


def make_trajectory(scenario_key: str, zone_id: uuid.UUID, scores: list[float]) -> Trajectory:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps = tuple(
        TrajectoryStep(
            timestamp=base + timedelta(minutes=5 * i),
            feature_vector=vector(score),
            risk=score,
            tier="normal",
            triggered_agents=frozenset(),
            assessment_id=uuid.uuid4(),
        )
        for i, score in enumerate(scores)
    )
    return Trajectory(scenario_key=scenario_key, incident=None, zone_id=zone_id, steps=steps)


def test_identical_trailing_windows_score_highest_similarity() -> None:
    zone_a, zone_b = uuid.uuid4(), uuid.uuid4()
    current = make_trajectory("current_scenario", zone_a, [10.0, 20.0, 30.0])
    identical_candidate = make_trajectory("historical_scenario", zone_b, [10.0, 20.0, 30.0])
    different_candidate = make_trajectory("historical_scenario_2", zone_b, [90.0, 95.0, 99.0])

    matches = match_trajectories(current, [identical_candidate, different_candidate], window_size=3)

    assert matches[0].trajectory.scenario_key == "historical_scenario"
    assert matches[0].similarity == 1.0
    assert matches[0].similarity > matches[1].similarity


def test_excludes_candidate_with_same_scenario_and_zone_as_current() -> None:
    zone_a = uuid.uuid4()
    current = make_trajectory("shared_scenario", zone_a, [10.0, 20.0])
    same_incident = make_trajectory("shared_scenario", zone_a, [10.0, 20.0])

    matches = match_trajectories(current, [same_incident], window_size=2)

    assert matches == []


def test_finds_best_anchor_position_within_a_longer_candidate() -> None:
    zone_a, zone_b = uuid.uuid4(), uuid.uuid4()
    current = make_trajectory("current_scenario", zone_a, [50.0, 60.0])
    # The candidate's shape [50, 60] appears at index 3-4, buried among unrelated values.
    candidate = make_trajectory("historical_scenario", zone_b, [5.0, 5.0, 5.0, 50.0, 60.0, 5.0])

    matches = match_trajectories(current, [candidate], window_size=2)

    assert len(matches) == 1
    assert matches[0].anchor_index == 4


def test_empty_current_window_returns_no_matches() -> None:
    zone_a, zone_b = uuid.uuid4(), uuid.uuid4()
    current = make_trajectory("current_scenario", zone_a, [])
    candidate = make_trajectory("historical_scenario", zone_b, [10.0, 20.0])

    assert match_trajectories(current, [candidate], window_size=3) == []


def test_top_n_limits_result_count() -> None:
    zone_a = uuid.uuid4()
    current = make_trajectory("current_scenario", zone_a, [10.0])
    candidates = [make_trajectory(f"historical_{i}", uuid.uuid4(), [10.0 + i]) for i in range(10)]

    matches = match_trajectories(current, candidates, window_size=1, top_n=3)

    assert len(matches) == 3
