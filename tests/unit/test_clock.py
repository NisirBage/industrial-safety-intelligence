"""SimClock behavior - advance, reset, now."""

from datetime import UTC, datetime, timedelta

from src.domain.simulation.clock import SimClock

START = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


def test_now_returns_start_time_initially() -> None:
    clock = SimClock(START)
    assert clock.now() == START


def test_advance_moves_time_forward() -> None:
    clock = SimClock(START)
    clock.advance(10)
    assert clock.now() == START + timedelta(minutes=10)


def test_advance_is_cumulative() -> None:
    clock = SimClock(START)
    clock.advance(5)
    clock.advance(7)
    assert clock.now() == START + timedelta(minutes=12)


def test_reset_returns_to_start_time() -> None:
    clock = SimClock(START)
    clock.advance(30)
    clock.reset()
    assert clock.now() == START
