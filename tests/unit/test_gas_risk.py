"""Gas Risk Agent tests.

Every hand-computed expected value below is derived from the same
formulas gas_risk.py implements, chosen so the arithmetic works out
to exact, easily-checked numbers (e.g. risk=50.0 at half the alarm
threshold) - not because the underlying math is special-cased for
tests.
"""

import math
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from src.domain.agents.base import AgentInput
from src.domain.agents.gas_risk import (
    GasReading,
    GasRiskAgent,
    GasRiskConfig,
    calculate_confidence,
    calculate_risk,
    calculate_time_to_threshold,
)
from src.domain.simulation.generator import generate_sensor_readings
from src.domain.simulation.scenario import load_scenario

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = GasRiskConfig()
DEMO_SCENARIO_PATH = Path(__file__).resolve().parents[2] / "scenarios" / "demo_vizag_clairton.yaml"


def _make_input(context: dict[str, object]) -> AgentInput:
    return AgentInput(zone_id=ZONE_ID, sim_time=NOW, tick_id=1, context=context)


# --- calculate_risk -----------------------------------------------------


def _risk(readings: list[GasReading], threshold: float = 10.0, floor: float = 40.0) -> float:
    return calculate_risk(readings, threshold, floor, sim_time=NOW, config=CONFIG)


def test_risk_at_half_threshold_is_exactly_fifty() -> None:
    readings = [GasReading(timestamp=NOW, value=5.0)]
    assert _risk(readings) == pytest.approx(50.0)


def test_risk_at_threshold_is_seventy_five_not_one_hundred() -> None:
    """Saturating, not linear: even at the alarm threshold itself, risk
    doesn't hit 100 - it approaches it asymptotically."""
    readings = [GasReading(timestamp=NOW, value=10.0)]
    assert _risk(readings) == pytest.approx(75.0)


def test_stale_reading_decays_toward_elevated_floor_not_zero() -> None:
    stale_time = NOW - timedelta(minutes=30)
    readings = [
        GasReading(timestamp=stale_time - timedelta(minutes=10), value=5.0),
        GasReading(timestamp=stale_time - timedelta(minutes=5), value=5.0),
        GasReading(timestamp=stale_time, value=5.0),
    ]
    risk = _risk(readings)
    # raw_risk at x/threshold=0.5 is 50.0; 30 minutes of decay (lambda=ln2/15)
    # is exactly 2 half-lives, so decayed = 40 + (50-40)*0.25 = 42.5.
    assert risk == pytest.approx(42.5)
    assert 40.0 < risk < 50.0


def test_missing_data_returns_elevated_floor_exactly() -> None:
    assert _risk([]) == 40.0


# --- calculate_confidence ------------------------------------------------


def test_confidence_is_high_for_fresh_calibrated_sufficient_data() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=10), value=1.0),
        GasReading(timestamp=NOW - timedelta(minutes=5), value=2.0),
        GasReading(timestamp=NOW, value=3.0),
    ]
    confidence = calculate_confidence(readings, last_calibrated_at=NOW, sim_time=NOW, config=CONFIG)
    assert confidence == pytest.approx(1.0)


def test_confidence_is_low_for_missing_data() -> None:
    confidence = calculate_confidence([], last_calibrated_at=None, sim_time=NOW, config=CONFIG)
    assert confidence == CONFIG.missing_data_confidence


def test_stale_data_reduces_confidence_independently_of_history() -> None:
    stale_time = NOW - timedelta(minutes=30)
    readings = [
        GasReading(timestamp=stale_time - timedelta(minutes=10), value=1.0),
        GasReading(timestamp=stale_time - timedelta(minutes=5), value=2.0),
        GasReading(timestamp=stale_time, value=3.0),
    ]
    confidence = calculate_confidence(readings, last_calibrated_at=NOW, sim_time=NOW, config=CONFIG)
    # freshness = e^(-lambda*30) = e^(-ln4) = 0.25; calibration and
    # history are both perfect, so the minimum is freshness alone.
    assert confidence == pytest.approx(0.25)


def test_insufficient_history_reduces_confidence_even_when_fresh() -> None:
    readings = [GasReading(timestamp=NOW, value=1.0)]
    confidence = calculate_confidence(readings, last_calibrated_at=NOW, sim_time=NOW, config=CONFIG)
    assert confidence == pytest.approx(CONFIG.insufficient_history_confidence_floor)


def test_uncalibrated_sensor_reduces_confidence_despite_good_data() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=10), value=1.0),
        GasReading(timestamp=NOW - timedelta(minutes=5), value=2.0),
        GasReading(timestamp=NOW, value=3.0),
    ]
    stale_calibration = NOW - timedelta(days=60)
    confidence = calculate_confidence(
        readings, last_calibrated_at=stale_calibration, sim_time=NOW, config=CONFIG
    )
    assert confidence == pytest.approx(CONFIG.uncalibrated_confidence_floor)


# --- calculate_time_to_threshold -----------------------------------------


def test_time_to_threshold_matches_hand_computed_regression() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=10), value=2.0),
        GasReading(timestamp=NOW - timedelta(minutes=5), value=4.0),
        GasReading(timestamp=NOW, value=6.0),
    ]
    ttt = calculate_time_to_threshold(readings, alarm_threshold=10.0, config=CONFIG)
    # slope = 0.4/min exactly (perfectly linear 3-point series);
    # (10 - 6) / 0.4 = 10.0 minutes.
    assert ttt == pytest.approx(10.0)


def test_time_to_threshold_is_none_for_falling_trend() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=10), value=6.0),
        GasReading(timestamp=NOW - timedelta(minutes=5), value=4.0),
        GasReading(timestamp=NOW, value=2.0),
    ]
    assert calculate_time_to_threshold(readings, alarm_threshold=10.0, config=CONFIG) is None


def test_time_to_threshold_is_none_with_fewer_than_minimum_readings() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=5), value=2.0),
        GasReading(timestamp=NOW, value=6.0),
    ]
    assert calculate_time_to_threshold(readings, alarm_threshold=10.0, config=CONFIG) is None


def test_time_to_threshold_is_zero_when_already_at_or_past_threshold() -> None:
    readings = [
        GasReading(timestamp=NOW - timedelta(minutes=10), value=8.0),
        GasReading(timestamp=NOW - timedelta(minutes=5), value=10.0),
        GasReading(timestamp=NOW, value=12.0),
    ]
    assert calculate_time_to_threshold(readings, alarm_threshold=10.0, config=CONFIG) == 0.0


# --- GasRiskAgent (full evaluate()) --------------------------------------


async def test_evaluate_normal_case() -> None:
    """ "Normal" means fresh, calibrated, AND sufficient history (>=3
    readings) - fewer than that is the insufficient_history case
    tested separately, even if otherwise fresh."""
    agent = GasRiskAgent()
    result = await agent.evaluate(
        _make_input(
            {
                "readings": [
                    GasReading(timestamp=NOW - timedelta(minutes=10), value=5.0),
                    GasReading(timestamp=NOW - timedelta(minutes=5), value=5.0),
                    GasReading(timestamp=NOW, value=5.0),
                ],
                "alarm_threshold": 10.0,
                "last_calibrated_at": NOW,
            }
        )
    )
    assert result.agent_name == "gas_risk"
    assert result.risk == pytest.approx(50.0)
    assert result.confidence == pytest.approx(1.0)
    assert "saturating_threshold_function" in result.justification.rules_fired


async def test_evaluate_missing_data_case() -> None:
    agent = GasRiskAgent()
    result = await agent.evaluate(_make_input({"readings": [], "alarm_threshold": 10.0}))
    assert result.risk == 40.0
    assert result.confidence == CONFIG.missing_data_confidence
    assert result.justification.rules_fired == ["missing_data_fail_safe"]


async def test_evaluate_uses_zone_elevated_floor_override() -> None:
    agent = GasRiskAgent()
    result = await agent.evaluate(
        _make_input({"readings": [], "alarm_threshold": 10.0, "elevated_floor_override": 55.0})
    )
    assert result.risk == 55.0


async def test_evaluate_raises_on_missing_required_context_key() -> None:
    """A missing alarm_threshold is a caller bug, not sensor
    degradation - it must propagate, never be swallowed into a
    conservative result."""
    agent = GasRiskAgent()
    with pytest.raises(KeyError):
        await agent.evaluate(_make_input({"readings": []}))


async def test_evaluate_is_deterministic() -> None:
    agent = GasRiskAgent()
    input_ = _make_input(
        {
            "readings": [GasReading(timestamp=NOW, value=5.0)],
            "alarm_threshold": 10.0,
            "last_calibrated_at": NOW,
        }
    )
    first = await agent.evaluate(input_)
    second = await agent.evaluate(input_)
    assert first == second


async def test_evaluate_against_m2_demo_scenario_fixture() -> None:
    """Uses M2's authored demo scenario as fixture data, per M3's own
    stated dependency ("M2 test fixtures") - not a golden-value
    assertion, just confirming the agent runs sanely against
    realistic, independently-generated data."""
    scenario = load_scenario(DEMO_SCENARIO_PATH)
    generated = generate_sensor_readings(scenario)
    co_readings = [
        GasReading(timestamp=r.timestamp, value=r.value)
        for r in generated
        if r.zone_key == "zone-compressor-house" and r.gas_type == "CO"
    ]
    assert len(co_readings) > 0

    agent = GasRiskAgent()
    result = await agent.evaluate(
        _make_input(
            {
                "readings": co_readings,
                "alarm_threshold": 35.0,  # matches sensor-ch-co-1 in demo_plant.json
            }
        )
    )
    assert 0.0 <= result.risk <= 100.0
    assert 0.0 <= result.confidence <= 1.0


def test_config_steepness_k_matches_documented_derivation() -> None:
    """r_i = 50 at x/threshold = 0.5 solves to k = 2*ln(2) - locks the
    derivation itself in, independent of calculate_risk's own tests."""
    assert GasRiskConfig().steepness_k == pytest.approx(2 * math.log(2))
