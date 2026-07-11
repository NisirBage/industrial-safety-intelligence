"""Unit tests for src/historical/lessons.py - a pure lookup table, no
database.
"""

from src.historical.lessons import lesson_for_rule, lessons_for_rules


def test_known_rule_returns_its_authored_lesson() -> None:
    lesson = lesson_for_rule("interaction_bonus_applied")
    assert lesson.rule == "interaction_bonus_applied"
    assert "compound" in lesson.lesson.lower() or "simops" in lesson.lesson.lower()


def test_unknown_rule_returns_fallback_not_a_crash() -> None:
    lesson = lesson_for_rule("some_future_rule_not_yet_authored")
    assert lesson.rule == "some_future_rule_not_yet_authored"
    assert "normal" in lesson.lesson.lower() or "policy" in lesson.lesson.lower()


def test_lessons_for_rules_deduplicates_by_rule_identifier() -> None:
    lessons = lessons_for_rules(["tier_escalated", "tier_escalated", "interaction_bonus_applied"])
    rules = [lesson.rule for lesson in lessons]
    assert rules == ["tier_escalated", "interaction_bonus_applied"]


def test_lessons_for_rules_preserves_first_occurrence_order() -> None:
    lessons = lessons_for_rules(["interaction_bonus_applied", "tier_escalated"])
    assert [lesson.rule for lesson in lessons] == ["interaction_bonus_applied", "tier_escalated"]


def test_lessons_for_empty_rules_is_empty() -> None:
    assert lessons_for_rules([]) == []
