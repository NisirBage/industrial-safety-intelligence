"""M25 Part 3 (Trajectory Matching) - deterministic distance over
*sequences* of ticks, not just a single current state. No ML, no
embeddings, no neural network: every distance below is the exact same
weighted Euclidean distance `src/historical/similarity.py` already
uses for a single tick, applied per aligned step and averaged over a
window. This is a direct extension of the existing similarity engine
to a trajectory, not a second algorithm.

Alignment strategy: for a candidate historical trajectory, every
position (`anchor_index`) is tried as "this is where the current
situation lines up in this incident's own timeline" - the current
window's last `n` steps are compared against the candidate's `n` steps
ending at that anchor, and the anchor with the lowest mean distance
wins. This is a bounded, deterministic sliding-window nearest-neighbor
search (at most `len(trajectory.steps)` comparisons per candidate) -
not a fitted or learned alignment. The winning anchor matters beyond
just scoring: `src/foresight/forecast.py` and `progression.py` both
look *forward* from it, since that is the real historical tick "now"
corresponds to.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.foresight.trajectory import Trajectory, TrajectoryStep
from src.historical.similarity import weighted_euclidean_distance


@dataclass(frozen=True)
class TrajectoryMatch:
    trajectory: Trajectory
    #: Index within `trajectory.steps` whose step aligns with the
    #: current window's most recent step - "now", inside this
    #: historical incident's own timeline.
    anchor_index: int
    #: `1 / (1 + mean_distance)` over the aligned window - bounded
    #: (0, 1], same transform `similarity_score` already uses.
    similarity: float
    #: How many steps were actually compared (may be less than the
    #: requested window size if either trajectory is shorter).
    window_length: int


def _windowed_distance(
    current_window: tuple[TrajectoryStep, ...],
    candidate_steps: tuple[TrajectoryStep, ...],
    anchor_index: int,
) -> tuple[float, int]:
    """Mean per-step weighted Euclidean distance between `current_window`
    (already sliced to the desired length by the caller) and the
    candidate's own window ending at `anchor_index`. Returns
    `(mean_distance, steps_compared)`; `steps_compared == 0` means no
    valid alignment exists (e.g. `anchor_index` is the candidate's very
    first step, so there is nothing before it to align against)."""
    available_before_anchor = anchor_index + 1
    n = min(len(current_window), available_before_anchor)
    if n == 0:
        return 0.0, 0

    aligned_current = current_window[-n:]
    aligned_candidate = candidate_steps[anchor_index - n + 1 : anchor_index + 1]

    distances = [
        weighted_euclidean_distance(c.feature_vector, h.feature_vector)
        for c, h in zip(aligned_current, aligned_candidate, strict=True)
    ]
    return sum(distances) / len(distances), len(distances)


def match_trajectories(
    current: Trajectory,
    candidates: list[Trajectory],
    window_size: int,
    top_n: int = 5,
) -> list[TrajectoryMatch]:
    """Top `top_n` historical trajectories whose own recent window most
    resembles `current`'s last `window_size` observations. Excludes a
    candidate that is literally the same (scenario_key, zone_id) as
    `current` - this platform's only 3 real scenarios mean the
    "currently-viewed replay" is always itself one of the cataloged
    historical incidents, so without this exclusion every query would
    trivially match itself with near-zero distance."""
    current_window = current.window(window_size)
    if len(current_window) == 0:
        return []

    matches: list[TrajectoryMatch] = []
    for trajectory in candidates:
        if (
            trajectory.scenario_key == current.scenario_key
            and trajectory.zone_id == current.zone_id
        ):
            continue

        best_anchor: int | None = None
        best_distance = float("inf")
        best_n = 0
        for anchor_index in range(len(trajectory.steps)):
            mean_distance, n_compared = _windowed_distance(
                current_window, trajectory.steps, anchor_index
            )
            if n_compared == 0:
                continue
            if mean_distance < best_distance:
                best_distance = mean_distance
                best_anchor = anchor_index
                best_n = n_compared

        if best_anchor is not None:
            matches.append(
                TrajectoryMatch(
                    trajectory=trajectory,
                    anchor_index=best_anchor,
                    similarity=1.0 / (1.0 + best_distance),
                    window_length=best_n,
                )
            )

    matches.sort(key=lambda m: m.similarity, reverse=True)
    return matches[:top_n]


__all__ = ["TrajectoryMatch", "match_trajectories"]
