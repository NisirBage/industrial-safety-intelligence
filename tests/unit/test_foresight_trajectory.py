"""Unit tests for src/foresight/trajectory.py - pure functions, no
database. Mirrors tests/unit/test_historical_feature_vector.py's
fixture-helper style.
"""

import uuid
from datetime import UTC, datetime

from src.foresight.trajectory import build_current_trajectory
from src.historical.feature_vector import FeatureVector

ZONE_ID = uuid.uuid4()


def vector(compound_risk_score: float = 10.0) -> FeatureVector:
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


def test_build_current_trajectory_preserves_order_and_fields() -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    t1 = datetime(2026, 1, 1, 0, 5, tzinfo=UTC)
    id0, id1 = uuid.uuid4(), uuid.uuid4()

    trajectory = build_current_trajectory(
        zone_id=ZONE_ID,
        scenario_key="demo_scenario",
        feature_vectors_by_assessment=[
            (vector(10.0), "normal", t0, id0),
            (vector(40.0), "watch", t1, id1),
        ],
    )

    assert trajectory.scenario_key == "demo_scenario"
    assert trajectory.zone_id == ZONE_ID
    assert trajectory.incident is None
    assert len(trajectory.steps) == 2
    assert trajectory.steps[0].timestamp == t0
    assert trajectory.steps[0].tier == "normal"
    assert trajectory.steps[0].risk == 10.0
    assert trajectory.steps[1].tier == "watch"
    assert trajectory.steps[1].assessment_id == id1


def test_window_returns_last_n_steps() -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    entries = [(vector(float(i)), "normal", t0, uuid.uuid4()) for i in range(5)]
    trajectory = build_current_trajectory(ZONE_ID, "demo_scenario", entries)

    window = trajectory.window(2)
    assert len(window) == 2
    assert window[0].risk == 3.0
    assert window[1].risk == 4.0


def test_window_shorter_than_n_returns_all_steps() -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    entries = [(vector(1.0), "normal", t0, uuid.uuid4())]
    trajectory = build_current_trajectory(ZONE_ID, "demo_scenario", entries)

    assert trajectory.window(5) == trajectory.steps


def test_window_of_zero_or_negative_returns_empty() -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    entries = [(vector(1.0), "normal", t0, uuid.uuid4())]
    trajectory = build_current_trajectory(ZONE_ID, "demo_scenario", entries)

    assert trajectory.window(0) == ()
    assert trajectory.window(-1) == ()
