"""Unit tests for src/historical/feature_vector.py - pure functions,
no database. Every `RiskAssessment` fixture below is hand-constructed
the same way tests/unit/test_replay.py already does, not read from a
live database.
"""

import uuid
from datetime import UTC, datetime

from src.historical.feature_vector import AGENT_NAMES, build_feature_vector
from src.infra.db.models.risk_assessment import RiskAssessment

ZONE_ID = uuid.uuid4()


def assessment(
    timestamp: datetime,
    tier: str = "normal",
    compound_risk_score: float = 10.0,
    confidence: float = 0.9,
    agent_contributions: dict[str, dict[str, float]] | None = None,
    rules_fired: list[str] | None = None,
    interaction_bonus_applied: float = 1.0,
    tier_before: str | None = None,
) -> RiskAssessment:
    return RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        timestamp=timestamp,
        compound_risk_score=compound_risk_score,
        confidence=confidence,
        tier=tier,
        justification={
            "schema_version": 1,
            "rules_fired": rules_fired or [],
            "agent_contributions": agent_contributions or {},
            "interaction_bonus_applied": interaction_bonus_applied,
            "tier_before": tier_before or tier,
            "tier_after": tier,
        },
    )


def test_agent_risks_read_from_agent_contributions() -> None:
    tick = assessment(
        datetime(2026, 1, 1, tzinfo=UTC),
        agent_contributions={
            "gas_risk": {"risk": 80.0, "confidence": 0.9},
            "equipment_status": {"risk": 10.0, "confidence": 0.8},
        },
    )
    vector = build_feature_vector(tick, previous=None)
    assert vector.gas_risk == 80.0
    assert vector.equipment_risk == 10.0
    assert vector.worker_risk == 0.0  # not present in agent_contributions -> defaults to 0
    assert vector.permit_risk == 0.0


def test_triggered_agent_count_and_set_match_nonzero_agents() -> None:
    tick = assessment(
        datetime(2026, 1, 1, tzinfo=UTC),
        agent_contributions={
            "gas_risk": {"risk": 50.0, "confidence": 0.9},
            "equipment_status": {"risk": 0.0, "confidence": 0.5},
            "permit_intelligence": {"risk": 20.0, "confidence": 0.7},
        },
    )
    vector = build_feature_vector(tick, previous=None)
    assert vector.triggered_agent_count == 2
    assert vector.triggered_agents == frozenset({"gas_risk", "permit_intelligence"})


def test_tier_ordinal_matches_frozen_tier_order() -> None:
    assert (
        build_feature_vector(
            assessment(datetime(2026, 1, 1, tzinfo=UTC), tier="normal"), None
        ).tier_ordinal
        == 0
    )
    assert (
        build_feature_vector(
            assessment(datetime(2026, 1, 1, tzinfo=UTC), tier="watch"), None
        ).tier_ordinal
        == 1
    )
    assert (
        build_feature_vector(
            assessment(datetime(2026, 1, 1, tzinfo=UTC), tier="elevated"), None
        ).tier_ordinal
        == 2
    )
    assert (
        build_feature_vector(
            assessment(datetime(2026, 1, 1, tzinfo=UTC), tier="critical"), None
        ).tier_ordinal
        == 3
    )


def test_trend_is_zero_with_no_previous_tick() -> None:
    tick = assessment(datetime(2026, 1, 1, tzinfo=UTC), compound_risk_score=50.0)
    assert build_feature_vector(tick, previous=None).trend == 0


def test_trend_rising_and_falling() -> None:
    earlier = assessment(datetime(2026, 1, 1, tzinfo=UTC), compound_risk_score=20.0)
    later_higher = assessment(datetime(2026, 1, 1, 0, 5, tzinfo=UTC), compound_risk_score=40.0)
    later_lower = assessment(datetime(2026, 1, 1, 0, 5, tzinfo=UTC), compound_risk_score=5.0)
    later_same = assessment(datetime(2026, 1, 1, 0, 5, tzinfo=UTC), compound_risk_score=20.0)

    assert build_feature_vector(later_higher, previous=earlier).trend == 1
    assert build_feature_vector(later_lower, previous=earlier).trend == -1
    assert build_feature_vector(later_same, previous=earlier).trend == 0


def test_interaction_bonus_read_verbatim() -> None:
    tick = assessment(datetime(2026, 1, 1, tzinfo=UTC), interaction_bonus_applied=1.35)
    assert build_feature_vector(tick, previous=None).interaction_bonus == 1.35


def test_malformed_justification_defaults_safely() -> None:
    tick = assessment(datetime(2026, 1, 1, tzinfo=UTC))
    tick.justification = {}  # simulate a row with no structured justification at all
    vector = build_feature_vector(tick, previous=None)
    assert vector.gas_risk == 0.0
    assert vector.interaction_bonus == 1.0
    assert vector.triggered_agents == frozenset()


def test_as_tuple_length_matches_feature_names() -> None:
    from src.historical.feature_vector import FEATURE_NAMES

    tick = assessment(datetime(2026, 1, 1, tzinfo=UTC))
    vector = build_feature_vector(tick, previous=None)
    assert len(vector.as_tuple()) == len(FEATURE_NAMES)


def test_agent_names_are_the_four_real_agents() -> None:
    assert AGENT_NAMES == (
        "gas_risk",
        "equipment_status",
        "worker_exposure",
        "permit_intelligence",
    )
