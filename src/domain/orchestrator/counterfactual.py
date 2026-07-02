"""Counterfactual Comparator - Master Plan M5 task 5.

A deliberately separate, "naive single-threshold" baseline evaluated
against the same raw per-sensor data the real pipeline consumes,
never sharing code with the real Orchestrator (``scheduler.py``,
``risk_formula.py``, ``tiering.py``, ``justification.py``, or any
agent module) so it remains an honest strawman for the "compound risk
detection accuracy versus single-sensor baselines" headline claim
(Technical Review). A permanent structural test
(``tests/unit/test_counterfactual_independence.py``) enforces the
"never sharing code" requirement at the import level, not just in this
docstring.

Not a participant in the compound engine's execution graph: this
module does not implement the ``Agent`` protocol, is never scheduled,
and consumes none of the compound engine's own outputs (``AgentResult``,
``FusionResult``, ``TierState``, ``RiskAssessmentJustification``) -
only the same raw sensor readings that feed Gas Risk Agent, at the
earliest point in the pipeline, upstream of every agent.

A real single-sensor alarm system has a hard trip point, not a
continuous curve - a zone alerts here the moment *any* individual
sensor's latest reading is at or above *its own* threshold, with no
cross-referencing of other sensors, permits, equipment, workers, or
history/trend, and no fail-safe handling of missing or stale data
(that asymmetry, relative to Gas Risk Agent's continuous saturating
curve and its fail-safe-toward-``elevated_floor`` staleness handling,
is exactly what gives the compound engine lead time - see
``docs/algorithms/counterfactual.md``).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CounterfactualReading:
    """One sensor's identity, its latest raw value, and its own alarm
    threshold - independently declared rather than reusing
    ``gas_risk.GasReading`` (Counterfactual Comparator clarification
    2), per this project's standing discipline of domain-local types
    even where structurally similar (``GasReading`` itself was kept
    file-local to ``gas_risk.py`` for the same reason, M3B
    clarification 8).
    """

    sensor_id: str
    value: float
    alarm_threshold: float


@dataclass(frozen=True)
class CounterfactualResult:
    """One zone's naive-baseline verdict for one tick.

    ``triggered_sensors`` names every sensor that individually crossed
    its own threshold (empty when ``alert`` is ``False``).
    ``highest_ratio`` is purely diagnostic evidence - the largest
    value/threshold ratio seen this tick, computed regardless of
    whether any sensor actually alerted - and never participates in
    the comparison itself (Counterfactual Comparator clarification 4).
    """

    zone_id: uuid.UUID
    sim_time: datetime
    alert: bool
    triggered_sensors: list[str]
    highest_ratio: float | None = None


def _validate_reading(reading: CounterfactualReading) -> None:
    """A non-positive threshold or a negative reading is malformed
    input data, not a legitimate sensor state - a caller/integration
    bug that must propagate rather than be silently tolerated
    (Counterfactual Comparator clarification 6)."""
    if reading.alarm_threshold <= 0:
        raise ValueError(
            f"sensor {reading.sensor_id!r} has non-positive alarm_threshold: "
            f"{reading.alarm_threshold}"
        )
    if reading.value < 0:
        raise ValueError(f"sensor {reading.sensor_id!r} has negative value: {reading.value}")


def calculate_sensor_alert(reading: CounterfactualReading) -> bool:
    """A hard trip point at value/threshold >= 1.0 - a real
    single-sensor alarm system's actual behaviour, deliberately
    different from Gas Risk Agent's continuous saturating curve at the
    same ratio (~75/100 risk, not a binary trip, at ratio 1.0)."""
    return reading.value >= reading.alarm_threshold


def calculate_highest_ratio(readings: Sequence[CounterfactualReading]) -> float | None:
    """The largest value/threshold ratio across all sensors this tick.

    Diagnostic only - never gates ``alert`` (Counterfactual Comparator
    clarification 4). ``None`` when ``readings`` is empty: there is no
    ratio to report, not a zero one.
    """
    if not readings:
        return None
    return max(reading.value / reading.alarm_threshold for reading in readings)


def evaluate(
    zone_id: uuid.UUID,
    sim_time: datetime,
    readings: Sequence[CounterfactualReading],
) -> CounterfactualResult:
    """The one entry point: does any individual sensor, judged alone,
    cross its own threshold this tick?

    Missing data (an empty ``readings`` sequence) is not a failure - a
    naive system with nothing to compare simply does not alert, which
    is itself the naive baseline's structural blind spot, deliberately
    the opposite of Gas Risk Agent's fail-safe-toward-``elevated_floor``
    treatment of the same input.
    """
    for reading in readings:
        _validate_reading(reading)

    triggered_sensors = [
        reading.sensor_id for reading in readings if calculate_sensor_alert(reading)
    ]

    return CounterfactualResult(
        zone_id=zone_id,
        sim_time=sim_time,
        alert=bool(triggered_sensors),
        triggered_sensors=triggered_sensors,
        highest_ratio=calculate_highest_ratio(readings),
    )
