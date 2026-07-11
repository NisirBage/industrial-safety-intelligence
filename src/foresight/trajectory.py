"""M25 Part 1/2 (Trajectory Engine, Trajectory Model) - represents
every historical incident (and the currently-viewed replay) as an
ordered sequence of ticks, each carrying the same `FeatureVector`,
risk, tier, triggered agents, and timestamp `src/historical/` already
computes. Nothing here is a new computation over sensor data - it
only reorders/reshapes ticks `src/historical/knowledge_base.py` has
already indexed.

Reuses `knowledge_base.py`'s already-cached `IndexedTick`s (grouping
by incident+zone into an ordered sequence, never re-querying or
re-computing a feature vector) - the same cross-module reuse of a
module-private helper `src/historical/analytics.py` already
established at M24.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.historical.decks import HistoricalDeck, HistoricalIncident
from src.historical.feature_vector import FeatureVector
from src.historical.knowledge_base import IndexedTick, _build_index_for_deck


@dataclass(frozen=True)
class TrajectoryStep:
    """One tick within a trajectory - a real, persisted observation,
    never a projected one (projected points live only in
    `src/foresight/forecast.py`'s `ForecastPoint`, a distinct type)."""

    timestamp: datetime
    feature_vector: FeatureVector
    risk: float
    tier: str
    triggered_agents: frozenset[str]
    assessment_id: uuid.UUID


@dataclass(frozen=True)
class Trajectory:
    """One zone's full ordered tick sequence for one historical
    incident (or, for the currently-viewed replay, the zone's ticks up
    to the current cursor - built the same way by the same function,
    see `build_current_trajectory` below)."""

    scenario_key: str
    incident: HistoricalIncident | None
    zone_id: uuid.UUID
    steps: tuple[TrajectoryStep, ...]  # ascending by timestamp

    def window(self, n: int) -> tuple[TrajectoryStep, ...]:
        """The last `n` steps (or fewer, if the trajectory is shorter
        than `n`) - the "last N observations" `src/foresight/matching.py`
        compares against each historical trajectory's own equally
        recent window."""
        if n <= 0:
            return ()
        return self.steps[-n:]


def _step_from_tick(tick: IndexedTick) -> TrajectoryStep:
    return TrajectoryStep(
        timestamp=tick.assessment.timestamp,
        feature_vector=tick.feature_vector,
        risk=tick.feature_vector.compound_risk_score,
        tier=tick.assessment.tier,
        triggered_agents=tick.feature_vector.triggered_agents,
        assessment_id=tick.assessment.assessment_id,
    )


def build_trajectories_for_deck(session: Session, deck: HistoricalDeck) -> list[Trajectory]:
    """One `Trajectory` per (incident, zone) pair in `deck`."""
    grouped: dict[tuple[str, uuid.UUID], list[IndexedTick]] = {}
    for tick in _build_index_for_deck(session, deck):
        key = (tick.incident.scenario_key, tick.zone_id)
        grouped.setdefault(key, []).append(tick)

    trajectories: list[Trajectory] = []
    for (scenario_key, zone_id), ticks in grouped.items():
        ticks_sorted = sorted(ticks, key=lambda t: t.assessment.timestamp)
        trajectories.append(
            Trajectory(
                scenario_key=scenario_key,
                incident=ticks_sorted[0].incident,
                zone_id=zone_id,
                steps=tuple(_step_from_tick(t) for t in ticks_sorted),
            )
        )
    return trajectories


def build_current_trajectory(
    zone_id: uuid.UUID,
    scenario_key: str,
    feature_vectors_by_assessment: list[
        tuple[FeatureVector, str, datetime, uuid.UUID]
    ],  # (feature_vector, tier, timestamp, assessment_id), ascending
) -> Trajectory:
    """Builds the currently-viewed replay's own trajectory from
    already-computed feature vectors (the caller - the `/foresight`
    router - builds these the same way `knowledge_base.py` does, via
    `build_feature_vector`, over the zone's own real persisted
    history). `incident=None` distinguishes "the trajectory being
    forecast for" from a historical `Trajectory`, which always carries
    a real `HistoricalIncident`."""
    steps = tuple(
        TrajectoryStep(
            timestamp=timestamp,
            feature_vector=feature_vector,
            risk=feature_vector.compound_risk_score,
            tier=tier,
            triggered_agents=feature_vector.triggered_agents,
            assessment_id=assessment_id,
        )
        for feature_vector, tier, timestamp, assessment_id in feature_vectors_by_assessment
    )
    return Trajectory(scenario_key=scenario_key, incident=None, zone_id=zone_id, steps=steps)


__all__ = [
    "TrajectoryStep",
    "Trajectory",
    "build_trajectories_for_deck",
    "build_current_trajectory",
]
