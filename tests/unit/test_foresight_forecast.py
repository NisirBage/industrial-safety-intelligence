"""Unit tests for src/foresight/forecast.py - pure functions, no
database, hand-computed expected values.
"""

import uuid
from datetime import UTC, datetime, timedelta

from src.foresight.forecast import generate_forecast
from src.foresight.matching import TrajectoryMatch
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


def step(minutes_from_base: int, risk: float, tier: str, base: datetime) -> TrajectoryStep:
    return TrajectoryStep(
        timestamp=base + timedelta(minutes=minutes_from_base),
        feature_vector=vector(risk),
        risk=risk,
        tier=tier,
        triggered_agents=frozenset(),
        assessment_id=uuid.uuid4(),
    )


def test_forecast_uses_nearest_real_step_at_or_after_horizon() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps = (
        step(0, 50.0, "watch", base),  # anchor
        step(14, 60.0, "watch", base),  # before 15-min horizon
        step(17, 70.0, "elevated", base),  # first real tick at/after 15 min
        step(60, 90.0, "critical", base),
    )
    trajectory = Trajectory(scenario_key="s1", incident=None, zone_id=uuid.uuid4(), steps=steps)
    match = TrajectoryMatch(trajectory=trajectory, anchor_index=0, similarity=0.8, window_length=1)

    points = generate_forecast([match], horizons=(15,))

    assert len(points) == 1
    assert points[0].projected_risk == 70.0
    assert points[0].projected_tier == "elevated"
    assert points[0].evidence[0].minutes_after_anchor == 17


def test_forecast_is_similarity_weighted_average_across_matches() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    high_similarity_steps = (step(0, 50.0, "watch", base), step(15, 80.0, "elevated", base))
    low_similarity_steps = (step(0, 50.0, "watch", base), step(15, 20.0, "normal", base))
    high_trajectory = Trajectory(
        scenario_key="a", incident=None, zone_id=uuid.uuid4(), steps=high_similarity_steps
    )
    low_trajectory = Trajectory(
        scenario_key="b", incident=None, zone_id=uuid.uuid4(), steps=low_similarity_steps
    )

    matches = [
        TrajectoryMatch(
            trajectory=high_trajectory, anchor_index=0, similarity=0.9, window_length=1
        ),
        TrajectoryMatch(trajectory=low_trajectory, anchor_index=0, similarity=0.1, window_length=1),
    ]

    points = generate_forecast(matches, horizons=(15,))

    # weighted mean = (80*0.9 + 20*0.1) / (0.9+0.1) = 74.0
    assert points[0].projected_risk == 74.0
    # elevated carries more similarity weight (0.9) than normal (0.1)
    assert points[0].projected_tier == "elevated"


def test_forecast_marks_horizon_unavailable_when_no_match_has_data() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps = (step(0, 50.0, "watch", base),)  # nothing after the anchor
    trajectory = Trajectory(scenario_key="s1", incident=None, zone_id=uuid.uuid4(), steps=steps)
    match = TrajectoryMatch(trajectory=trajectory, anchor_index=0, similarity=0.8, window_length=1)

    points = generate_forecast([match], horizons=(60,))

    assert points[0].projected_risk is None
    assert points[0].projected_tier is None
    assert points[0].evidence == []
    assert points[0].unavailable_reason is not None


def test_forecast_generates_one_point_per_horizon() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps = (
        step(0, 50.0, "watch", base),
        step(15, 60.0, "watch", base),
        step(30, 70.0, "elevated", base),
        step(60, 90.0, "critical", base),
    )
    trajectory = Trajectory(scenario_key="s1", incident=None, zone_id=uuid.uuid4(), steps=steps)
    match = TrajectoryMatch(trajectory=trajectory, anchor_index=0, similarity=1.0, window_length=1)

    points = generate_forecast([match], horizons=(15, 30, 60))

    assert [p.horizon_minutes for p in points] == [15, 30, 60]
    assert [p.projected_risk for p in points] == [60.0, 70.0, 90.0]
