"""Curve generators - pure functions describing physically-plausible sensor value shapes over time.

Exists because the domain research is explicit that generating
synthetic sensor data as random noise instead of physically-motivated
curves "collapses the credibility of the entire compound-risk story."
Each generator is a pure function of ``(t, params)`` only - no
repository, database, clock, logging, or randomness access, so it can
be unit-tested with no fixtures at all and can never itself be the
source of a non-reproducible run.

``src/domain/simulation/scenario.py`` validates that a scenario's
declared ``curve`` name and ``params`` are usable against
``CURVE_REGISTRY``/``CURVE_REQUIRED_PARAMS`` before a run starts;
``src/domain/simulation/generator.py`` is what actually calls these
functions to build a reading sequence.
"""

import math
from collections.abc import Mapping
from typing import Protocol


class CurveFunction(Protocol):
    def __call__(self, t: float, params: Mapping[str, float]) -> float: ...


def exponential_rise(t: float, params: Mapping[str, float]) -> float:
    """``start_value * e^(rate * t)`` - a diffusion-shaped rise, not a spike."""
    return params["start_value"] * math.exp(params["rate"] * t)


def linear_ramp(t: float, params: Mapping[str, float]) -> float:
    """``start_value + slope * t``."""
    return params["start_value"] + params["slope"] * t


def step(t: float, params: Mapping[str, float]) -> float:
    """``baseline`` until ``step_time``, then ``step_value``."""
    return params["step_value"] if t >= params["step_time"] else params["baseline"]


CURVE_REGISTRY: dict[str, CurveFunction] = {
    "exponential_rise": exponential_rise,
    "linear_ramp": linear_ramp,
    "step": step,
}

CURVE_REQUIRED_PARAMS: dict[str, tuple[str, ...]] = {
    "exponential_rise": ("start_value", "rate"),
    "linear_ramp": ("start_value", "slope"),
    "step": ("baseline", "step_value", "step_time"),
}
