"""M25 Part 6/7 (Incident Progression, Early Warning) - both derived
entirely from the real tier sequences of matched historical
trajectories, never computed independently of history. "Expected
Resolution" looks for the real first return to NORMAL after each
match's anchor point (never invented, and honestly marked unavailable
if no matched incident ever resolved within its own persisted replay
window). Early Warning is a deterministic classification into exactly
four categories with a "why" citation, never a bare label.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.foresight.forecast import ForecastPoint
from src.foresight.matching import TrajectoryMatch
from src.infra.db.models.risk_assessment import RISK_TIERS


@dataclass(frozen=True)
class ProgressionStage:
    label: str
    tier: str | None
    supporting_matches: int
    total_matches: int
    evidence: str


@dataclass(frozen=True)
class IncidentProgression:
    current_stage: ProgressionStage
    likely_next_stage: ProgressionStage
    likely_following_stage: ProgressionStage
    expected_resolution: ProgressionStage


def _stage_from_forecast_point(point: ForecastPoint | None, total_matches: int) -> ProgressionStage:
    if point is None or point.projected_tier is None:
        return ProgressionStage(
            label="Unavailable",
            tier=None,
            supporting_matches=0,
            total_matches=total_matches,
            evidence="No matched historical incident has data at this horizon.",
        )
    supporting = len(point.evidence)
    return ProgressionStage(
        label=point.projected_tier.upper(),
        tier=point.projected_tier,
        supporting_matches=supporting,
        total_matches=total_matches,
        evidence=(
            f"{supporting} of {total_matches} matched incident(s) support "
            f"{point.projected_tier.upper()} within {point.horizon_minutes} minutes."
        ),
    )


def _expected_resolution(matches: list[TrajectoryMatch]) -> ProgressionStage:
    minutes_to_resolution: list[float] = []
    for match in matches:
        anchor_step = match.trajectory.steps[match.anchor_index]
        for step in match.trajectory.steps[match.anchor_index + 1 :]:
            if step.tier == "normal":
                minutes_to_resolution.append(
                    (step.timestamp - anchor_step.timestamp).total_seconds() / 60
                )
                break

    total = len(matches)
    if not minutes_to_resolution:
        return ProgressionStage(
            label="Unavailable",
            tier=None,
            supporting_matches=0,
            total_matches=total,
            evidence=(
                "No matched incident returned to NORMAL within its own persisted replay window."
            ),
        )

    average_minutes = sum(minutes_to_resolution) / len(minutes_to_resolution)
    resolved_count = len(minutes_to_resolution)
    return ProgressionStage(
        label=f"Return to NORMAL (typically ~{average_minutes:.0f} min)",
        tier="normal",
        supporting_matches=resolved_count,
        total_matches=total,
        evidence=(
            f"{resolved_count} of {total} matched incident(s) returned to NORMAL, "
            f"averaging {average_minutes:.0f} minutes after the matched point."
        ),
    )


def derive_progression(
    current_tier: str, matches: list[TrajectoryMatch], forecast_points: list[ForecastPoint]
) -> IncidentProgression:
    total = len(matches)
    current_stage = ProgressionStage(
        label=current_tier.upper(),
        tier=current_tier,
        supporting_matches=total,
        total_matches=total,
        evidence="Current persisted tier for this zone - not a projection.",
    )
    next_point = forecast_points[0] if len(forecast_points) > 0 else None
    following_point = forecast_points[1] if len(forecast_points) > 1 else None

    return IncidentProgression(
        current_stage=current_stage,
        likely_next_stage=_stage_from_forecast_point(next_point, total),
        likely_following_stage=_stage_from_forecast_point(following_point, total),
        expected_resolution=_expected_resolution(matches),
    )


@dataclass(frozen=True)
class EarlyWarningSignal:
    #: One of exactly four categories the milestone asks for.
    category: str
    why: str
    supporting_matches: int
    total_matches: int


def derive_early_warning(
    current_tier: str, matches: list[TrajectoryMatch], forecast_points: list[ForecastPoint]
) -> EarlyWarningSignal:
    total = len(matches)

    # Shutdown override: if any horizon's similarity-weighted majority
    # of matches reached CRITICAL, that dominates every other signal.
    for point in forecast_points:
        if not point.evidence:
            continue
        total_weight = sum(item.similarity for item in point.evidence)
        critical_weight = sum(
            item.similarity for item in point.evidence if item.observed_tier == "critical"
        )
        if total_weight > 0 and critical_weight / total_weight >= 0.5:
            count = sum(1 for item in point.evidence if item.observed_tier == "critical")
            return EarlyWarningSignal(
                category="Potential Shutdown",
                why=(
                    f"{count} of {len(point.evidence)} matched incident(s) reached CRITICAL "
                    f"within {point.horizon_minutes} minutes."
                ),
                supporting_matches=count,
                total_matches=total,
            )

    nearest = next((p for p in forecast_points if p.projected_tier is not None), None)
    if nearest is None or nearest.projected_tier is None:
        return EarlyWarningSignal(
            category="Potential Stabilization",
            why="No matched incident had data to project a trend from.",
            supporting_matches=0,
            total_matches=total,
        )

    current_ordinal = RISK_TIERS.index(current_tier) if current_tier in RISK_TIERS else 0
    projected_ordinal = RISK_TIERS.index(nearest.projected_tier)
    supporting = len(nearest.evidence)

    if projected_ordinal > current_ordinal:
        category = "Potential Escalation"
        verb = "rising"
    elif projected_ordinal < current_ordinal:
        category = "Potential Recovery"
        verb = "falling"
    else:
        category = "Potential Stabilization"
        verb = "holding"

    why = (
        f"{supporting} of {total} matched incident(s) show tier {verb} "
        f"to {nearest.projected_tier.upper()} within {nearest.horizon_minutes} minutes."
    )
    return EarlyWarningSignal(
        category=category, why=why, supporting_matches=supporting, total_matches=total
    )


__all__ = [
    "ProgressionStage",
    "IncidentProgression",
    "derive_progression",
    "EarlyWarningSignal",
    "derive_early_warning",
]
