"""M25 Part 4 (Forecast) - projections at 15/30/60 minutes, generated
entirely by looking up REAL historical continuations of matched
trajectories and aggregating them, similarity-weighted. This is
historical analogy, not extrapolation: there is no curve fit, no
regression, no time-series model anywhere in this module. Every
projected number is a weighted average of real `compound_risk_score`
values the frozen engine already computed and persisted at some real
historical tick; every projected tier is the real tier most matched
incidents actually reached. If no matched incident has persisted data
reaching a given horizon, that horizon is honestly marked unavailable
- never interpolated or invented.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from src.foresight.matching import TrajectoryMatch
from src.foresight.trajectory import TrajectoryStep

#: The three horizons Part 4 asks for, in minutes.
HORIZONS_MINUTES: tuple[int, ...] = (15, 30, 60)


@dataclass(frozen=True)
class ForecastEvidence:
    """One matched incident's real, observed value at (or just past)
    this horizon - the citation every projection must carry."""

    scenario_key: str
    zone_id: uuid.UUID
    similarity: float
    observed_risk: float
    observed_tier: str
    observed_timestamp: datetime
    #: Real elapsed minutes from the matched anchor to this observation
    #: - may exceed the nominal horizon slightly, since ticks are not
    #: evenly spaced; the nearest real tick at-or-after the horizon is
    #: used, never an interpolated one.
    minutes_after_anchor: float


@dataclass(frozen=True)
class ForecastPoint:
    horizon_minutes: int
    #: None exactly when `unavailable_reason` is set - no matched
    #: incident had data reaching this horizon.
    projected_risk: float | None
    projected_tier: str | None
    evidence: list[ForecastEvidence]
    unavailable_reason: str | None


def _nearest_step_at_or_after(
    steps: tuple[TrajectoryStep, ...], anchor_index: int, target_timestamp: datetime
) -> TrajectoryStep | None:
    candidates = [step for step in steps[anchor_index + 1 :] if step.timestamp >= target_timestamp]
    if not candidates:
        return None
    return min(candidates, key=lambda step: step.timestamp)


def generate_forecast(
    matches: list[TrajectoryMatch], horizons: tuple[int, ...] = HORIZONS_MINUTES
) -> list[ForecastPoint]:
    """One `ForecastPoint` per horizon, aggregated across every match
    that has real data reaching it. Aggregation is a similarity-weighted
    mean for the risk score and a similarity-weighted "vote" for the
    tier (the tier whose supporting matches carry the most total
    similarity weight wins) - deterministic, no randomness, no fitting.
    """
    points: list[ForecastPoint] = []
    for horizon in horizons:
        evidence: list[ForecastEvidence] = []
        for match in matches:
            anchor_step = match.trajectory.steps[match.anchor_index]
            target = anchor_step.timestamp + timedelta(minutes=horizon)
            step = _nearest_step_at_or_after(match.trajectory.steps, match.anchor_index, target)
            if step is None:
                continue
            evidence.append(
                ForecastEvidence(
                    scenario_key=match.trajectory.scenario_key,
                    zone_id=match.trajectory.zone_id,
                    similarity=match.similarity,
                    observed_risk=step.risk,
                    observed_tier=step.tier,
                    observed_timestamp=step.timestamp,
                    minutes_after_anchor=(step.timestamp - anchor_step.timestamp).total_seconds()
                    / 60,
                )
            )

        if not evidence:
            points.append(
                ForecastPoint(
                    horizon_minutes=horizon,
                    projected_risk=None,
                    projected_tier=None,
                    evidence=[],
                    unavailable_reason=(
                        f"No matched historical incident has persisted data reaching "
                        f"{horizon} minutes past the matched point."
                    ),
                )
            )
            continue

        total_weight = sum(item.similarity for item in evidence)
        projected_risk = (
            sum(item.observed_risk * item.similarity for item in evidence) / total_weight
        )

        tier_weights: dict[str, float] = {}
        for item in evidence:
            tier_weights[item.observed_tier] = (
                tier_weights.get(item.observed_tier, 0.0) + item.similarity
            )
        projected_tier = max(tier_weights.items(), key=lambda pair: pair[1])[0]

        points.append(
            ForecastPoint(
                horizon_minutes=horizon,
                projected_risk=projected_risk,
                projected_tier=projected_tier,
                evidence=evidence,
                unavailable_reason=None,
            )
        )
    return points


__all__ = ["HORIZONS_MINUTES", "ForecastEvidence", "ForecastPoint", "generate_forecast"]
