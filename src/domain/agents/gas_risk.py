"""Gas Risk Agent - Technical Review Section 4.1/5.1.

Converts timestamped gas/pressure readings for one zone into a
deterministic risk score, confidence, and time-to-threshold estimate.
This is the first of M3's three Tier-0 agents implementing the M3A
``Agent`` contract; ``GasReading`` is scoped to this file alone (M3B
clarification 8) rather than added to the shared ``base.py``.

Zero I/O, like the rest of ``src/domain/``: every value the formulas
need arrives pre-fetched via ``AgentInput.context``, populated by
whichever services-layer caller assembles it (M5/M6) - this module
never imports a repository.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import cast

from src.domain.agents.base import AgentInput, AgentMetadata, AgentResult, Justification


@dataclass(frozen=True)
class GasReading:
    """One timestamped sensor value. ``readings`` sequences passed to the
    functions in this module must be ordered oldest to newest (M3B
    clarification 4) - nothing here re-sorts, since silently correcting
    a caller's ordering bug would hide it rather than surface it."""

    timestamp: datetime
    value: float


@dataclass(frozen=True)
class GasRiskConfig:
    """Immutable, tunable parameters - the only state a ``GasRiskAgent``
    instance retains between evaluations (M3A's "only immutable
    configuration" rule, M3B clarification 1). Every default below is
    either derived from a constraint the source documents state, or
    cited directly from a numeric example they give - none is
    arbitrary, and each is called out below.
    """

    formula_version: int = 1
    # Derived so r_i = 50 at x_i/threshold_i = 0.5, per Technical Review
    # 5.1's "tuned so r_i ~ 50 around... elevated but not yet alarming":
    # 50 = 100*(1-e^(-k*0.5)) solves to k = 2*ln(2).
    steepness_k: float = 2 * math.log(2)
    # Not given a numeric value anywhere in the source docs. This
    # default halves a reading's excess above the elevated floor
    # roughly every 15 minutes of staleness - reasonable, not cited,
    # a candidate for tuning once real sensor cadence is known.
    decay_lambda: float = math.log(2) / 15
    # Purely a labeling threshold for justification/rules_fired - the
    # underlying risk/confidence decay is continuous in delta-minutes
    # regardless of this value.
    stale_after_minutes: float = 15.0
    min_readings_for_regression: int = 3
    calibration_stale_days: float = 30.0
    # Cited directly: Technical Review 5.3's own interaction-bonus
    # example uses "elevated_floor (e.g., 40)".
    default_elevated_floor: float = 40.0
    missing_data_confidence: float = 0.1
    uncalibrated_confidence_floor: float = 0.3
    insufficient_history_confidence_floor: float = 0.5


def calculate_risk(
    readings: Sequence[GasReading],
    alarm_threshold: float,
    elevated_floor: float,
    sim_time: datetime,
    config: GasRiskConfig,
) -> float:
    """Saturating-function risk score (5.1), decayed toward
    ``elevated_floor`` as the latest reading ages (5.4) - never toward
    zero, so a silent sensor cannot be gamed into appearing safe.

    Returns ``elevated_floor`` directly if ``readings`` is empty
    (missing data): there is no current value to compute a saturating
    score from at all.

    The source document's decay formula is written as a plain
    exponential decay toward zero (``r_i(t) = r_i(t_last) * e^(-lambda*dt)``),
    which contradicts its own stated intent one sentence later
    ("decays toward the elevated_floor... not toward zero"). This
    implements the form that actually satisfies that stated intent:
    asymptoting to ``elevated_floor`` as staleness grows, and exactly
    equal to the fresh saturating score at zero staleness.
    """
    if not readings:
        return elevated_floor

    latest = readings[-1]
    raw_risk = 100.0 * (1.0 - math.exp(-config.steepness_k * (latest.value / alarm_threshold)))
    delta_minutes = (sim_time - latest.timestamp).total_seconds() / 60.0
    if delta_minutes <= 0:
        return raw_risk

    return elevated_floor + (raw_risk - elevated_floor) * math.exp(
        -config.decay_lambda * delta_minutes
    )


def calculate_confidence(
    readings: Sequence[GasReading],
    last_calibrated_at: datetime | None,
    sim_time: datetime,
    config: GasRiskConfig,
) -> float:
    """Minimum of independent sub-scores (freshness, calibration
    recency, history sufficiency) - the worst factor gates confidence,
    per Technical Review 5.5, so two good signals can never mask one
    bad one.
    """
    if not readings:
        return config.missing_data_confidence

    latest = readings[-1]
    delta_minutes = max((sim_time - latest.timestamp).total_seconds() / 60.0, 0.0)
    freshness_score = math.exp(-config.decay_lambda * delta_minutes)

    if last_calibrated_at is None:
        calibration_score = config.uncalibrated_confidence_floor
    else:
        calibration_age_days = (sim_time - last_calibrated_at).total_seconds() / 86400.0
        calibration_score = (
            1.0
            if calibration_age_days <= config.calibration_stale_days
            else config.uncalibrated_confidence_floor
        )

    history_score = (
        1.0
        if len(readings) >= config.min_readings_for_regression
        else config.insufficient_history_confidence_floor
    )

    return min(freshness_score, calibration_score, history_score)


def calculate_time_to_threshold(
    readings: Sequence[GasReading],
    alarm_threshold: float,
    config: GasRiskConfig,
) -> float | None:
    """Linear-regression trend (4.1) extrapolated to the alarm threshold.

    Requires at least ``config.min_readings_for_regression`` readings
    (M3B clarification 3) - with fewer, the trend is unavailable
    rather than extrapolated from insufficient data. Returns ``None``
    when the trend is flat or falling (never reaches the threshold) or
    when all readings share a timestamp (no time axis to regress on).
    """
    if len(readings) < config.min_readings_for_regression:
        return None

    t0 = readings[0].timestamp
    xs = [(r.timestamp - t0).total_seconds() / 60.0 for r in readings]
    ys = [r.value for r in readings]

    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return None

    slope = numerator / denominator  # units per minute
    if slope <= 0:
        return None

    latest_value = ys[-1]
    if latest_value >= alarm_threshold:
        return 0.0
    return (alarm_threshold - latest_value) / slope


def build_justification(
    readings: Sequence[GasReading],
    alarm_threshold: float,
    elevated_floor: float,
    last_calibrated_at: datetime | None,
    sim_time: datetime,
    time_to_threshold: float | None,
    config: GasRiskConfig,
) -> Justification:
    """Assembles the per-agent explanation - enough raw numbers that a
    human can re-derive the risk score by hand (Technical Review 5.9),
    independent of the risk/confidence calculations themselves so this
    can be tested without recomputing them.
    """
    evidence: dict[str, object] = {
        "formula_version": config.formula_version,
        "alarm_threshold": alarm_threshold,
        "elevated_floor": elevated_floor,
        "reading_count": len(readings),
        "time_to_threshold_minutes": time_to_threshold,
        "last_calibrated_at": last_calibrated_at.isoformat() if last_calibrated_at else None,
    }

    if not readings:
        return Justification(
            summary="No sensor readings available; reporting conservative elevated floor.",
            rules_fired=["missing_data_fail_safe"],
            evidence=evidence,
        )

    latest = readings[-1]
    delta_minutes = (sim_time - latest.timestamp).total_seconds() / 60.0
    pct_of_threshold = latest.value / alarm_threshold
    evidence["current_value"] = latest.value
    evidence["pct_of_threshold"] = pct_of_threshold
    evidence["minutes_since_last_reading"] = delta_minutes

    rules_fired: list[str] = []
    if delta_minutes > config.stale_after_minutes:
        rules_fired.append("stale_data_fail_safe")
    else:
        rules_fired.append("saturating_threshold_function")
    if len(readings) < config.min_readings_for_regression:
        rules_fired.append("insufficient_history")

    trend_text = (
        "trend unavailable"
        if time_to_threshold is None
        else f"~{time_to_threshold:.1f} min to threshold"
    )
    summary = f"{latest.value:.2f} ({pct_of_threshold:.0%} of threshold), {trend_text}."

    return Justification(summary=summary, rules_fired=rules_fired, evidence=evidence)


def _extract_readings(context: Mapping[str, object]) -> list[GasReading]:
    return cast(list[GasReading], context.get("readings", []))


def _extract_required_float(context: Mapping[str, object], key: str) -> float:
    """Raises KeyError if absent - a missing intrinsic value like a
    sensor's alarm threshold is a caller/integration bug, never
    sensor-side degradation, so it must propagate (M3A clarification 8)
    rather than fall back to a default.
    """
    return cast(float, context[key])


def _extract_optional_float(context: Mapping[str, object], key: str) -> float | None:
    return cast("float | None", context.get(key))


def _extract_optional_datetime(context: Mapping[str, object], key: str) -> datetime | None:
    return cast("datetime | None", context.get(key))


class GasRiskAgent:
    """Implements the M3A ``Agent`` protocol for gas/pressure risk.

    Stateless with respect to simulation data (M3A clarification 6):
    ``self._config`` is the only thing retained between evaluations,
    and it is immutable configuration, not simulation state.
    """

    metadata = AgentMetadata(
        name="gas_risk",
        description="Converts gas/pressure sensor readings into a per-zone risk contribution.",
    )

    def __init__(self, config: GasRiskConfig | None = None) -> None:
        self._config = config or GasRiskConfig()

    async def evaluate(self, input: AgentInput) -> AgentResult:
        readings = _extract_readings(input.context)
        alarm_threshold = _extract_required_float(input.context, "alarm_threshold")
        last_calibrated_at = _extract_optional_datetime(input.context, "last_calibrated_at")
        elevated_floor_override = _extract_optional_float(input.context, "elevated_floor_override")
        elevated_floor = (
            elevated_floor_override
            if elevated_floor_override is not None
            else self._config.default_elevated_floor
        )

        risk = calculate_risk(
            readings, alarm_threshold, elevated_floor, input.sim_time, self._config
        )
        confidence = calculate_confidence(
            readings, last_calibrated_at, input.sim_time, self._config
        )
        time_to_threshold = calculate_time_to_threshold(readings, alarm_threshold, self._config)
        justification = build_justification(
            readings=readings,
            alarm_threshold=alarm_threshold,
            elevated_floor=elevated_floor,
            last_calibrated_at=last_calibrated_at,
            sim_time=input.sim_time,
            time_to_threshold=time_to_threshold,
            config=self._config,
        )

        return AgentResult(
            agent_name=self.metadata.name,
            risk=risk,
            confidence=confidence,
            justification=justification,
            computed_at=input.sim_time,
        )
