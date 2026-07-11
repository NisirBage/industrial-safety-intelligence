"""Unit tests for src/foresight/progression.py - pure functions, no
database.
"""

import uuid
from datetime import UTC, datetime, timedelta

from src.foresight.forecast import ForecastEvidence, ForecastPoint
from src.foresight.matching import TrajectoryMatch
from src.foresight.progression import derive_early_warning, derive_progression
from src.foresight.trajectory import Trajectory, TrajectoryStep
from src.historical.feature_vector import FeatureVector


def vector() -> FeatureVector:
    return FeatureVector(
        gas_risk=0.0,
        equipment_risk=0.0,
        worker_risk=0.0,
        permit_risk=0.0,
        compound_risk_score=0.0,
        confidence=0.9,
        tier_ordinal=0,
        interaction_bonus=1.0,
        triggered_agent_count=0,
        trend=0,
    )


def step(minutes: int, tier: str, base: datetime) -> TrajectoryStep:
    return TrajectoryStep(
        timestamp=base + timedelta(minutes=minutes),
        feature_vector=vector(),
        risk=0.0,
        tier=tier,
        triggered_agents=frozenset(),
        assessment_id=uuid.uuid4(),
    )


def make_evidence(observed_tier: str, similarity: float = 0.5) -> ForecastEvidence:
    return ForecastEvidence(
        scenario_key="s",
        zone_id=uuid.uuid4(),
        similarity=similarity,
        observed_risk=50.0,
        observed_tier=observed_tier,
        observed_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        minutes_after_anchor=15.0,
    )


def test_expected_resolution_reports_average_minutes_when_matches_return_to_normal() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps_a = (step(0, "watch", base), step(20, "normal", base))
    steps_b = (step(0, "watch", base), step(40, "normal", base))
    match_a = TrajectoryMatch(
        trajectory=Trajectory("a", None, uuid.uuid4(), steps_a),
        anchor_index=0,
        similarity=0.5,
        window_length=1,
    )
    match_b = TrajectoryMatch(
        trajectory=Trajectory("b", None, uuid.uuid4(), steps_b),
        anchor_index=0,
        similarity=0.5,
        window_length=1,
    )

    progression = derive_progression("watch", [match_a, match_b], [])

    assert progression.expected_resolution.tier == "normal"
    assert progression.expected_resolution.supporting_matches == 2
    assert "30" in progression.expected_resolution.label  # average of 20 and 40


def test_expected_resolution_unavailable_when_no_match_resolves() -> None:
    base = datetime(2026, 1, 1, tzinfo=UTC)
    steps = (step(0, "elevated", base), step(60, "elevated", base))
    match = TrajectoryMatch(
        trajectory=Trajectory("a", None, uuid.uuid4(), steps),
        anchor_index=0,
        similarity=0.5,
        window_length=1,
    )

    progression = derive_progression("elevated", [match], [])

    assert progression.expected_resolution.tier is None
    assert progression.expected_resolution.label == "Unavailable"


def test_current_stage_reflects_real_persisted_tier_not_a_projection() -> None:
    progression = derive_progression("critical", [], [])
    assert progression.current_stage.tier == "critical"
    assert progression.current_stage.label == "CRITICAL"


def test_likely_next_and_following_stage_come_from_first_two_forecast_points() -> None:
    point_15 = ForecastPoint(15, 70.0, "elevated", [make_evidence("elevated")], None)
    point_30 = ForecastPoint(30, 90.0, "critical", [make_evidence("critical")], None)

    progression = derive_progression("watch", [], [point_15, point_30])

    assert progression.likely_next_stage.tier == "elevated"
    assert progression.likely_following_stage.tier == "critical"


def test_early_warning_shutdown_overrides_when_majority_reach_critical() -> None:
    point = ForecastPoint(
        15,
        90.0,
        "critical",
        [make_evidence("critical", 0.6), make_evidence("watch", 0.4)],
        None,
    )
    signal = derive_early_warning("elevated", [], [point])
    assert signal.category == "Potential Shutdown"


def test_early_warning_escalation_when_projected_tier_higher() -> None:
    point = ForecastPoint(15, 70.0, "elevated", [make_evidence("elevated")], None)
    signal = derive_early_warning("watch", [], [point])
    assert signal.category == "Potential Escalation"


def test_early_warning_recovery_when_projected_tier_lower() -> None:
    point = ForecastPoint(15, 10.0, "normal", [make_evidence("normal")], None)
    signal = derive_early_warning("watch", [], [point])
    assert signal.category == "Potential Recovery"


def test_early_warning_stabilization_when_projected_tier_unchanged() -> None:
    point = ForecastPoint(15, 40.0, "watch", [make_evidence("watch")], None)
    signal = derive_early_warning("watch", [], [point])
    assert signal.category == "Potential Stabilization"


def test_early_warning_defaults_to_stabilization_with_no_forecast_data() -> None:
    signal = derive_early_warning("watch", [], [])
    assert signal.category == "Potential Stabilization"
    assert signal.supporting_matches == 0
