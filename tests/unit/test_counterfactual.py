"""Counterfactual Comparator tests.

Every value below is independently hand-computed against the naive
"value >= threshold" trip point (shown in comments), per this
project's standing "validate with independently hand-computed values"
discipline - not derived from the code under test. Two tests reuse the
real alarm thresholds already seeded in ``tests/fixtures/demo_plant.json``
(CO=35, CH4=10) rather than inventing arbitrary numbers.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.orchestrator.counterfactual import (
    CounterfactualReading,
    CounterfactualResult,
    calculate_highest_ratio,
    calculate_sensor_alert,
    evaluate,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


# --- calculate_sensor_alert: the hard trip point --------------------------------


def test_reading_below_threshold_does_not_alert() -> None:
    reading = CounterfactualReading(sensor_id="co-1", value=20.0, alarm_threshold=35.0)
    assert calculate_sensor_alert(reading) is False


def test_reading_exactly_at_threshold_alerts() -> None:
    """>=, not >: a real alarm trips at the threshold itself."""
    reading = CounterfactualReading(sensor_id="ch4-1", value=10.0, alarm_threshold=10.0)
    assert calculate_sensor_alert(reading) is True


def test_reading_above_threshold_alerts() -> None:
    reading = CounterfactualReading(sensor_id="co-1", value=40.0, alarm_threshold=35.0)
    assert calculate_sensor_alert(reading) is True


# --- evaluate: zone-level aggregation across independent sensors ----------------


def test_all_sensors_below_threshold_no_zone_alert() -> None:
    readings = [
        CounterfactualReading(sensor_id="co-1", value=20.0, alarm_threshold=35.0),
        CounterfactualReading(sensor_id="ch4-1", value=5.0, alarm_threshold=10.0),
    ]
    result = evaluate(ZONE_ID, NOW, readings)

    assert isinstance(result, CounterfactualResult)
    assert result.alert is False
    assert result.triggered_sensors == []


def test_any_single_sensor_over_threshold_triggers_zone_alert() -> None:
    """Fixture-derived: CO at 30/35 (below), CH4 at 10/10 (at
    threshold) - only CH4 should be named, but the zone-level alert
    must be True because at least one sensor triggered."""
    readings = [
        CounterfactualReading(sensor_id="co-1", value=30.0, alarm_threshold=35.0),
        CounterfactualReading(sensor_id="ch4-1", value=10.0, alarm_threshold=10.0),
    ]
    result = evaluate(ZONE_ID, NOW, readings)

    assert result.alert is True
    assert result.triggered_sensors == ["ch4-1"]


def test_multiple_sensors_over_threshold_are_all_named() -> None:
    readings = [
        CounterfactualReading(sensor_id="co-1", value=40.0, alarm_threshold=35.0),
        CounterfactualReading(sensor_id="ch4-1", value=12.0, alarm_threshold=10.0),
    ]
    result = evaluate(ZONE_ID, NOW, readings)

    assert result.alert is True
    assert result.triggered_sensors == ["co-1", "ch4-1"]


def test_empty_readings_is_not_a_failure_and_produces_no_alert() -> None:
    """Missing data is the naive baseline's own structural blind spot,
    not an integration error - it must not raise."""
    result = evaluate(ZONE_ID, NOW, [])

    assert result.alert is False
    assert result.triggered_sensors == []
    assert result.highest_ratio is None


# --- calculate_highest_ratio: diagnostic only, never gates alert ----------------


def test_highest_ratio_is_the_max_across_sensors() -> None:
    # 30/35 ~= 0.857, 10/10 = 1.0 -> max is 1.0.
    readings = [
        CounterfactualReading(sensor_id="co-1", value=30.0, alarm_threshold=35.0),
        CounterfactualReading(sensor_id="ch4-1", value=10.0, alarm_threshold=10.0),
    ]
    assert calculate_highest_ratio(readings) == pytest.approx(1.0)


def test_highest_ratio_reported_even_when_below_threshold() -> None:
    # 20/35 ~= 0.5714 - no alert, but the ratio is still reported.
    readings = [CounterfactualReading(sensor_id="co-1", value=20.0, alarm_threshold=35.0)]
    result = evaluate(ZONE_ID, NOW, readings)

    assert result.alert is False
    assert result.highest_ratio == pytest.approx(20.0 / 35.0)


# --- Monotonicity invariant ------------------------------------------------------


def test_monotonicity_raising_value_across_threshold_can_only_add_an_alert() -> None:
    below = CounterfactualReading(sensor_id="co-1", value=34.9, alarm_threshold=35.0)
    above = CounterfactualReading(sensor_id="co-1", value=35.1, alarm_threshold=35.0)

    assert calculate_sensor_alert(below) is False
    assert calculate_sensor_alert(above) is True


# --- Determinism invariant --------------------------------------------------------


def test_determinism_identical_inputs_produce_identical_output() -> None:
    readings = [
        CounterfactualReading(sensor_id="co-1", value=30.0, alarm_threshold=35.0),
        CounterfactualReading(sensor_id="ch4-1", value=12.0, alarm_threshold=10.0),
    ]

    first = evaluate(ZONE_ID, NOW, readings)
    second = evaluate(ZONE_ID, NOW, readings)

    assert first == second


# --- Failure strategy: malformed input propagates --------------------------------


def test_non_positive_alarm_threshold_raises() -> None:
    readings = [CounterfactualReading(sensor_id="co-1", value=10.0, alarm_threshold=0.0)]
    with pytest.raises(ValueError):
        evaluate(ZONE_ID, NOW, readings)


def test_negative_reading_value_raises() -> None:
    readings = [CounterfactualReading(sensor_id="co-1", value=-1.0, alarm_threshold=35.0)]
    with pytest.raises(ValueError):
        evaluate(ZONE_ID, NOW, readings)
