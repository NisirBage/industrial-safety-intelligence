"""M25 Part 1/10/11 (Trajectory Engine orchestration, Multi-Deck
Support, Performance) - the one place that ties trajectory
extraction, matching, forecasting, confidence, and progression/early
warning together into a single result, the same orchestration role
`src/historical/knowledge_base.py` plays for M24. Reuses that module's
already-cached per-deck indexing (Part 11: no re-computation across
calls within the process lifetime, same caching discipline already
established and documented there).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.foresight.confidence import ForesightConfidence, compute_confidence
from src.foresight.forecast import HORIZONS_MINUTES, ForecastPoint, generate_forecast
from src.foresight.matching import TrajectoryMatch, match_trajectories
from src.foresight.progression import (
    EarlyWarningSignal,
    IncidentProgression,
    derive_early_warning,
    derive_progression,
)
from src.foresight.trajectory import (
    Trajectory,
    build_current_trajectory,
    build_trajectories_for_deck,
)
from src.historical.decks import HISTORICAL_DECKS, HistoricalDeck, get_deck
from src.historical.feature_vector import FeatureVector, build_feature_vector
from src.infra.db.models.risk_assessment import RiskAssessment


@dataclass(frozen=True)
class DeckContribution:
    """M25 Part 10 - which decks contributed matches, and how many
    distinct incidents from that deck matched."""

    deck_key: str
    deck_name: str
    matched_incident_count: int


@dataclass(frozen=True)
class ForesightResult:
    zone_id: uuid.UUID
    timestamp: datetime
    #: `recent_assessments[-1].compound_risk_score` verbatim - real,
    #: already-persisted data, not a new computation - kept here so a
    #: caller can phrase "risk projected to rise by N points" without
    #: a second lookup.
    current_risk_score: float
    current_tier: str
    window_size: int
    current_window_length: int
    matches: list[TrajectoryMatch]
    forecast: list[ForecastPoint]
    confidence: ForesightConfidence
    progression: IncidentProgression
    early_warning: EarlyWarningSignal
    deck_contributions: list[DeckContribution]


def _decks_for_key(deck_key: str | None) -> list[HistoricalDeck]:
    if deck_key is None:
        return list(HISTORICAL_DECKS)
    deck = get_deck(deck_key)
    return [deck] if deck is not None else []


def _build_candidate_trajectories(session: Session, deck_key: str | None) -> list[Trajectory]:
    trajectories: list[Trajectory] = []
    for deck in _decks_for_key(deck_key):
        trajectories.extend(build_trajectories_for_deck(session, deck))
    return trajectories


def _deck_contributions(
    matches: list[TrajectoryMatch], deck_key: str | None
) -> list[DeckContribution]:
    decks = _decks_for_key(deck_key)
    matched_by_deck: dict[str, set[str]] = {}
    for match in matches:
        incident = match.trajectory.incident
        if incident is None:
            continue
        for deck in decks:
            if incident in deck.incidents:
                matched_by_deck.setdefault(deck.key, set()).add(match.trajectory.scenario_key)
                break

    deck_by_key = {deck.key: deck for deck in decks}
    return [
        DeckContribution(
            deck_key=key, deck_name=deck_by_key[key].name, matched_incident_count=len(scenario_keys)
        )
        for key, scenario_keys in matched_by_deck.items()
    ]


def generate_operational_foresight(
    session: Session,
    zone_id: uuid.UUID,
    scenario_key: str,
    recent_assessments: list[RiskAssessment],
    window_size: int = 5,
    deck_key: str | None = None,
    top_n: int = 5,
) -> ForesightResult:
    """`recent_assessments` must be ascending by timestamp and end at
    "now" - the caller (the `/foresight` router) fetches this the same
    way `src/api/routers/historical.py` already fetches a single
    "previous" tick, just extended to a trailing window."""
    if not recent_assessments:
        raise ValueError(
            "generate_operational_foresight requires at least one persisted assessment"
        )

    feature_vectors: list[tuple[FeatureVector, str, datetime, uuid.UUID]] = []
    previous: RiskAssessment | None = None
    for assessment in recent_assessments:
        vector = build_feature_vector(assessment, previous)
        feature_vectors.append(
            (vector, assessment.tier, assessment.timestamp, assessment.assessment_id)
        )
        previous = assessment

    current_trajectory = build_current_trajectory(zone_id, scenario_key, feature_vectors)

    candidates = _build_candidate_trajectories(session, deck_key)
    matches = match_trajectories(current_trajectory, candidates, window_size, top_n=top_n)

    forecast_points = generate_forecast(matches, HORIZONS_MINUTES)
    current_window_length = len(current_trajectory.window(window_size))
    confidence = compute_confidence(
        current_window_length=current_window_length,
        requested_window_size=window_size,
        matches=matches,
        forecast_points=forecast_points,
    )

    current_tier = recent_assessments[-1].tier
    progression = derive_progression(current_tier, matches, forecast_points)
    early_warning = derive_early_warning(current_tier, matches, forecast_points)

    return ForesightResult(
        zone_id=zone_id,
        timestamp=recent_assessments[-1].timestamp,
        current_risk_score=float(recent_assessments[-1].compound_risk_score),
        current_tier=current_tier,
        window_size=window_size,
        current_window_length=current_window_length,
        matches=matches,
        forecast=forecast_points,
        confidence=confidence,
        progression=progression,
        early_warning=early_warning,
        deck_contributions=_deck_contributions(matches, deck_key),
    )


__all__ = ["DeckContribution", "ForesightResult", "generate_operational_foresight"]
