"""M24 Part 1/5/11 (Historical Knowledge Base, Incident Matches,
Performance) - the orchestration layer tying decks, feature vectors,
and the similarity engine together.

Reuses `src/services/replay.py::build_replay` - the exact function
`GET /replay` already calls - to fetch each deck incident's real
persisted assessments. Never runs a scenario, never writes anything,
never recomputes risk: every `RiskAssessment` row this module touches
was already written by the frozen engine.

Indexing strategy (Part 11): feature vectors are built once per deck
and cached in-process for the life of the application (`_INDEX_CACHE`,
keyed by deck key) - historical incidents do not change after they
were replayed, so there is nothing to invalidate. A similarity query is
then a **linear scan** over the cached vectors: O(n * d) per query,
where n is the number of indexed historical ticks across the deck(s)
searched and d is the fixed 9-dimensional feature width. At this
platform's real data scale (3 scenarios, a handful of zones, dozens of
ticks each - a few hundred vectors total across the one real deck) a
linear scan is comfortably sub-millisecond and does not warrant a
KD-tree/ball-tree or any approximate-nearest-neighbor structure -
building one here would be complexity this project's own conventions
discourage for a dataset this size. If a future deck grew into the tens
of thousands of ticks, that would be the point to introduce a proper
spatial index; the `IndexedTick` list this module already builds would
plug into one directly without changing `find_similar_incidents`'s
public signature.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.historical.decks import (
    HISTORICAL_DECKS,
    HistoricalDeck,
    HistoricalIncident,
    get_deck,
)
from src.historical.feature_vector import FeatureVector, build_feature_vector
from src.historical.lessons import Lesson, lessons_for_rules
from src.historical.similarity import matching_and_differing_features, similarity_score
from src.infra.db.models.risk_assessment import RISK_TIERS, RiskAssessment
from src.services.replay import build_replay
from src.services.scenario_catalog import get_scenario_summary

_TIER_RANK: dict[str, int] = {tier: index for index, tier in enumerate(RISK_TIERS)}


@dataclass(frozen=True)
class IndexedTick:
    incident: HistoricalIncident
    zone_id: uuid.UUID
    assessment: RiskAssessment
    feature_vector: FeatureVector


@dataclass(frozen=True)
class IncidentMatch:
    """M24 Part 5 - everything a match card needs, one object, no
    second lookup required by the caller."""

    scenario_key: str
    incident_name: str  # the scenario's own title, from scenario_catalog
    date: datetime
    zone_id: uuid.UUID
    similarity: float
    outcome_tier: str  # worst tier this zone reached across the whole incident
    root_cause: str
    business_impact: str
    operational_impact: str
    safety_impact: str
    matching_features: list[str]
    differing_features: list[str]
    lessons_learned: list[Lesson]
    evidence_source: str  # exact assessment this match was computed against, for audit


#: Per-deck cache of every indexed tick. Never invalidated at runtime -
#: see module docstring for why that is safe here.
_INDEX_CACHE: dict[str, list[IndexedTick]] = {}


def _rules_fired(assessment: RiskAssessment) -> list[str]:
    rules = assessment.justification.get("rules_fired") if assessment.justification else None
    return [rule for rule in rules if isinstance(rule, str)] if isinstance(rules, list) else []


def _build_index_for_deck(session: Session, deck: HistoricalDeck) -> list[IndexedTick]:
    cached = _INDEX_CACHE.get(deck.key)
    if cached is not None:
        return cached

    indexed: list[IndexedTick] = []
    for incident in deck.incidents:
        summary = get_scenario_summary(incident.scenario_key)
        if summary is None:
            # Scenario file referenced by deck metadata is missing from
            # the catalog - skip rather than crash, since this deck
            # entry can't be indexed without it.
            continue
        replay_data = build_replay(session, summary.zone_ids, summary.start_time, summary.end_time)
        for zone_timeline in replay_data.zone_timelines:
            previous: RiskAssessment | None = None
            for assessment in zone_timeline.assessments:
                feature_vector = build_feature_vector(assessment, previous)
                indexed.append(
                    IndexedTick(
                        incident=incident,
                        zone_id=zone_timeline.zone_id,
                        assessment=assessment,
                        feature_vector=feature_vector,
                    )
                )
                previous = assessment

    _INDEX_CACHE[deck.key] = indexed
    return indexed


def _outcome_tier(session: Session, incident: HistoricalIncident, zone_id: uuid.UUID) -> str:
    """Worst tier this specific zone reached across the whole incident
    - a real, computed fact (max over persisted ticks), never
    invented. Reuses the same indexed ticks already built for
    similarity search rather than re-querying."""
    deck = next((d for d in HISTORICAL_DECKS if incident in d.incidents), None)
    if deck is None:
        return "normal"
    ticks = [
        tick
        for tick in _build_index_for_deck(session, deck)
        if tick.incident is incident and tick.zone_id == zone_id
    ]
    if not ticks:
        return "normal"
    return max(ticks, key=lambda t: _TIER_RANK.get(t.assessment.tier, 0)).assessment.tier


def find_similar_incidents(
    session: Session,
    current_assessment: RiskAssessment,
    previous_assessment: RiskAssessment | None,
    top_n: int = 5,
    deck_key: str | None = None,
) -> list[IncidentMatch]:
    """M24 Part 5 - the top `top_n` historical ticks (across one deck,
    or all decks when `deck_key` is None) most similar to
    `current_assessment`, each carrying its own real similarity score,
    real outcome, and authored lessons learned. Excludes the current
    assessment itself from its own results, in case the "current"
    replay being viewed is itself one of the cataloged historical
    scenarios.
    """
    current_vector = build_feature_vector(current_assessment, previous_assessment)

    if deck_key is not None:
        deck = get_deck(deck_key)
        decks = [deck] if deck is not None else []
    else:
        decks = HISTORICAL_DECKS

    scored: list[tuple[IndexedTick, float]] = []
    for deck in decks:
        for tick in _build_index_for_deck(session, deck):
            if tick.assessment.assessment_id == current_assessment.assessment_id:
                continue
            result = similarity_score(current_vector, tick.feature_vector)
            scored.append((tick, result.similarity))

    scored.sort(key=lambda pair: pair[1], reverse=True)

    matches: list[IncidentMatch] = []
    for tick, similarity in scored[:top_n]:
        summary = get_scenario_summary(tick.incident.scenario_key)
        matching, differing = matching_and_differing_features(current_vector, tick.feature_vector)
        matches.append(
            IncidentMatch(
                scenario_key=tick.incident.scenario_key,
                incident_name=summary.title if summary else tick.incident.scenario_key,
                date=summary.start_time if summary else tick.assessment.timestamp,
                zone_id=tick.zone_id,
                similarity=similarity,
                outcome_tier=_outcome_tier(session, tick.incident, tick.zone_id),
                root_cause=tick.incident.root_cause,
                business_impact=tick.incident.business_impact,
                operational_impact=tick.incident.operational_impact,
                safety_impact=tick.incident.safety_impact,
                matching_features=matching,
                differing_features=differing,
                lessons_learned=lessons_for_rules(_rules_fired(tick.assessment)),
                evidence_source=(
                    f"{tick.incident.scenario_key} @ {tick.assessment.timestamp.isoformat()} "
                    f"(assessment {tick.assessment.assessment_id})"
                ),
            )
        )
    return matches
