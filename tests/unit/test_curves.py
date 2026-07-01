"""Curve generator shape correctness - each is a pure (t, params) -> value function."""

import math

from src.domain.simulation.curves import (
    CURVE_REGISTRY,
    CURVE_REQUIRED_PARAMS,
    exponential_rise,
    linear_ramp,
    step,
)


def test_exponential_rise_matches_formula() -> None:
    params = {"start_value": 5.0, "rate": 0.1}
    assert exponential_rise(10, params) == 5.0 * math.exp(0.1 * 10)


def test_exponential_rise_increases_with_t() -> None:
    params = {"start_value": 5.0, "rate": 0.1}
    assert exponential_rise(20, params) > exponential_rise(10, params) > exponential_rise(0, params)


def test_linear_ramp_matches_formula() -> None:
    params = {"start_value": 2.0, "slope": 0.5}
    assert linear_ramp(6, params) == 2.0 + 0.5 * 6


def test_step_before_and_after_step_time() -> None:
    params = {"baseline": 1.0, "step_value": 9.0, "step_time": 5.0}
    assert step(4, params) == 1.0
    assert step(5, params) == 9.0
    assert step(6, params) == 9.0


def test_registry_and_required_params_have_matching_keys() -> None:
    assert set(CURVE_REGISTRY) == set(CURVE_REQUIRED_PARAMS)
