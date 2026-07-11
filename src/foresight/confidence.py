"""M25 Part 5 (Confidence) - deterministic forecast confidence, broken
into four independently-computed factors as the milestone specifies,
then combined via **minimum**, not an average - deliberately mirroring
this platform's own frozen confidence-aggregation discipline
(`docs/architecture/CORE_FREEZE.md` §5: "minimum across independent
factors ... never an average, without exception, anywhere in the
engine"). Operational Foresight is not part of the frozen engine and
is not bound by that document, but taking the minimum here keeps
"confidence" meaning the same thing everywhere in this platform: the
weakest link, not a number that can be inflated by averaging one
strong factor against several weak ones.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.foresight.forecast import ForecastPoint
from src.foresight.matching import TrajectoryMatch


@dataclass(frozen=True)
class ForesightConfidence:
    #: How much the matched incidents agree with each other on the
    #: projected outcome (1 - normalized spread of their observed risk
    #: values at each horizon, averaged over horizons with 2+ matches).
    #: 0.0 when fewer than two matches ever share a horizon - agreement
    #: cannot be established from a single opinion, and treating that
    #: as full agreement would overstate confidence.
    historical_agreement: float
    #: How much of the requested trailing window the current trajectory
    #: actually had (e.g. 3 of a requested 5 ticks -> 0.6).
    data_completeness: float
    #: Mean trajectory-match similarity across the matches actually
    #: used - low when even the best historical analogues aren't very
    #: similar.
    trajectory_similarity: float
    #: Fraction of (match, horizon) pairs that had real persisted data
    #: to cite - low when matched incidents ended before a horizon.
    replay_coverage: float
    #: `min()` of the four factors above.
    overall: float


def compute_confidence(
    current_window_length: int,
    requested_window_size: int,
    matches: list[TrajectoryMatch],
    forecast_points: list[ForecastPoint],
) -> ForesightConfidence:
    data_completeness = (
        min(1.0, current_window_length / requested_window_size)
        if requested_window_size > 0
        else 0.0
    )

    trajectory_similarity = (
        sum(match.similarity for match in matches) / len(matches) if matches else 0.0
    )

    agreements: list[float] = []
    for point in forecast_points:
        if len(point.evidence) < 2:
            continue
        values = [item.observed_risk for item in point.evidence]
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        stdev = variance**0.5
        # 100 is the full 0-100 risk scale - a stdev of 100 across
        # matches (maximally disagreeing) maps to zero agreement.
        agreements.append(max(0.0, 1.0 - stdev / 100.0))
    historical_agreement = sum(agreements) / len(agreements) if agreements else 0.0

    total_possible = len(matches) * len(forecast_points)
    total_covered = sum(len(point.evidence) for point in forecast_points)
    replay_coverage = total_covered / total_possible if total_possible > 0 else 0.0

    overall = min(data_completeness, trajectory_similarity, historical_agreement, replay_coverage)

    return ForesightConfidence(
        historical_agreement=historical_agreement,
        data_completeness=data_completeness,
        trajectory_similarity=trajectory_similarity,
        replay_coverage=replay_coverage,
        overall=overall,
    )


__all__ = ["ForesightConfidence", "compute_confidence"]
