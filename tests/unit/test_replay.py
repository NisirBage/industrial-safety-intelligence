"""Unit tests for src/services/replay.py's pure bookmark-detection
logic - no database, no I/O. Every assertion checks that a bookmark is
derived from fields a `RiskAssessment`/`Permit` row already carries,
never a recomputed value.
"""

import uuid
from datetime import UTC, datetime

from src.infra.db.models.permit import Permit
from src.infra.db.models.risk_assessment import RiskAssessment
from src.services.replay import _detect_bookmarks, _has_interaction_bonus, _tier_transition

ZONE_ID = uuid.uuid4()


def assessment(
    timestamp: datetime,
    tier_before: str = "normal",
    tier_after: str = "normal",
    compound_risk_score: float = 10.0,
    rules_fired: list[str] | None = None,
    interaction_bonus_applied: float = 1.0,
) -> RiskAssessment:
    return RiskAssessment(
        assessment_id=uuid.uuid4(),
        zone_id=ZONE_ID,
        timestamp=timestamp,
        compound_risk_score=compound_risk_score,
        confidence=0.5,
        tier=tier_after,
        justification={
            "schema_version": 1,
            "rules_fired": rules_fired or [],
            "agent_contributions": {},
            "interaction_bonus_applied": interaction_bonus_applied,
            "tier_before": tier_before,
            "tier_after": tier_after,
        },
    )


def test_tier_transition_returns_before_and_after() -> None:
    a = assessment(datetime(2026, 1, 1, tzinfo=UTC), tier_before="watch", tier_after="elevated")
    assert _tier_transition(a) == ("watch", "elevated")


def test_tier_transition_returns_none_for_malformed_justification() -> None:
    a = assessment(datetime(2026, 1, 1, tzinfo=UTC))
    a.justification = {}
    assert _tier_transition(a) is None


def test_has_interaction_bonus_true_only_when_rule_name_present() -> None:
    with_bonus = assessment(
        datetime(2026, 1, 1, tzinfo=UTC), rules_fired=["interaction_bonus_applied"]
    )
    without_bonus = assessment(datetime(2026, 1, 1, tzinfo=UTC), rules_fired=["tier_stable"])
    assert _has_interaction_bonus(with_bonus) is True
    assert _has_interaction_bonus(without_bonus) is False


def test_detect_bookmarks_flags_tier_change() -> None:
    a = assessment(datetime(2026, 1, 1, tzinfo=UTC), tier_before="normal", tier_after="watch")
    bookmarks = _detect_bookmarks(ZONE_ID, [a], [])
    kinds = [b.kind for b in bookmarks]
    assert "tier_change" in kinds
    assert "critical" not in kinds


def test_detect_bookmarks_flags_critical_transition_separately() -> None:
    a = assessment(datetime(2026, 1, 1, tzinfo=UTC), tier_before="elevated", tier_after="critical")
    bookmarks = _detect_bookmarks(ZONE_ID, [a], [])
    kinds = [b.kind for b in bookmarks]
    assert "tier_change" in kinds
    assert "critical" in kinds


def test_detect_bookmarks_no_tier_change_bookmark_when_tier_holds() -> None:
    a = assessment(datetime(2026, 1, 1, tzinfo=UTC), tier_before="watch", tier_after="watch")
    bookmarks = _detect_bookmarks(ZONE_ID, [a], [])
    # A single assessment always yields exactly one highest_risk bookmark
    # (it's trivially the max of a one-element list) - no tier_change or
    # critical bookmark since the tier didn't move.
    assert [b.kind for b in bookmarks] == ["highest_risk"]


def test_detect_bookmarks_flags_interaction_bonus() -> None:
    a = assessment(
        datetime(2026, 1, 1, tzinfo=UTC),
        rules_fired=["interaction_bonus_applied"],
        interaction_bonus_applied=1.8,
    )
    bookmarks = _detect_bookmarks(ZONE_ID, [a], [])
    bonus_bookmarks = [b for b in bookmarks if b.kind == "interaction_bonus"]
    assert len(bonus_bookmarks) == 1
    assert "1.8" in bonus_bookmarks[0].label


def test_detect_bookmarks_flags_highest_risk_tick_only() -> None:
    low = assessment(datetime(2026, 1, 1, 0, 0, tzinfo=UTC), compound_risk_score=20.0)
    high = assessment(datetime(2026, 1, 1, 1, 0, tzinfo=UTC), compound_risk_score=95.0)
    mid = assessment(datetime(2026, 1, 1, 2, 0, tzinfo=UTC), compound_risk_score=50.0)
    bookmarks = _detect_bookmarks(ZONE_ID, [low, high, mid], [])
    highest = [b for b in bookmarks if b.kind == "highest_risk"]
    assert len(highest) == 1
    assert highest[0].assessment_id == high.assessment_id


def test_detect_bookmarks_flags_permit_activation() -> None:
    permit = Permit(
        permit_id=uuid.uuid4(),
        permit_type="hot_work",
        zone_id=ZONE_ID,
        issued_at=datetime(2026, 1, 1, 5, 0, tzinfo=UTC),
        expires_at=datetime(2026, 1, 1, 13, 0, tzinfo=UTC),
        authorizing_officer_id=uuid.uuid4(),
        baseline_snapshot={},
        status="active",
    )
    bookmarks = _detect_bookmarks(ZONE_ID, [], [permit])
    assert len(bookmarks) == 1
    assert bookmarks[0].kind == "permit_activated"
    assert "hot_work" in bookmarks[0].label


def test_detect_bookmarks_empty_for_no_assessments_or_permits() -> None:
    assert _detect_bookmarks(ZONE_ID, [], []) == []
