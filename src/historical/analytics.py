"""M24 Part 9 (Cross-Scenario Analytics) - deterministic aggregation
across every indexed historical tick. Every number below is a count or
average over real persisted `RiskAssessment` rows and their real
`rules_fired`; nothing is estimated or modeled.

Two items the milestone asks for are honestly reported as unavailable
rather than fabricated, per this project's standing rule against
invented data:

- **Most effective interventions**: this deterministic engine has no
  intervention/operator-response mechanic at all - a scenario replay
  is sensor/permit events in, risk assessments out, with no feedback
  loop for "and then the operator did X, and risk fell". There is
  nothing to measure effectiveness against.
- **Industry comparisons**: 6 industry decks are registered (M28 Part
  10), but only one has incident data - it is on one simulated plant,
  so no second industry exists anywhere in this codebase's data to
  compare against.

Both are represented as an explicit unavailable marker (the same
"Status: Unavailable" honesty pattern this platform already uses
elsewhere - see `frontend/src/pages/DiagnosticsPage.tsx`), not omitted
silently and not padded with a plausible-looking invented number.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from src.historical.decks import HISTORICAL_DECKS
from src.historical.knowledge_base import IndexedTick, _build_index_for_deck
from src.historical.lessons import Lesson, lesson_for_rule

#: Which real rule identifiers belong to which agent - copied from the
#: same grouping `frontend/src/lib/pipelineStages.ts` already
#: established for the same 21 identifiers, not redefined
#: independently.
_EQUIPMENT_RULES = frozenset(
    {
        "missing_equipment_context",
        "confirmed_empty_inventory",
        "no_degradation",
        "common_cause_grouped_degradation_count",
    }
)
_PERMIT_RULES = frozenset(
    {
        "fail_open_never",
        "no_open_permits",
        "permit_status_escalated",
        "permits_within_policy",
    }
)
_WORKER_RULES = frozenset(
    {
        "missing_location_fail_safe",
        "exposure_weighted_headcount",
        "unauthorized_presence",
    }
)


@dataclass(frozen=True)
class RuleFrequency:
    rule: str
    lesson: str
    #: Number of distinct incidents (scenario_key) in which this rule
    #: fired at least once - not raw tick count, so a rule that fires
    #: on every tick of one long incident doesn't outrank a rule that
    #: fired briefly in three separate incidents.
    incident_count: int


@dataclass(frozen=True)
class Unavailable:
    reason: str


@dataclass(frozen=True)
class CrossScenarioAnalytics:
    total_incidents: int
    total_indexed_ticks: int
    most_common_causes: list[RuleFrequency]
    most_common_equipment_issues: list[RuleFrequency]
    most_common_permit_conflicts: list[RuleFrequency]
    most_common_worker_hazards: list[RuleFrequency]
    average_resolution_minutes: float | None  # None when no escalation episode ever resolved
    most_effective_interventions: Unavailable
    industry_comparisons: Unavailable


def _rule_frequencies(
    ticks: list[IndexedTick], allowed_rules: frozenset[str] | None
) -> list[RuleFrequency]:
    incidents_by_rule: dict[str, set[str]] = {}
    for tick in ticks:
        justification = tick.assessment.justification or {}
        rules = justification.get("rules_fired")
        if not isinstance(rules, list):
            continue
        for rule in rules:
            if not isinstance(rule, str):
                continue
            if allowed_rules is not None and rule not in allowed_rules:
                continue
            incidents_by_rule.setdefault(rule, set()).add(tick.incident.scenario_key)

    frequencies = [
        RuleFrequency(rule=rule, lesson=lesson_for_rule(rule).lesson, incident_count=len(incidents))
        for rule, incidents in incidents_by_rule.items()
    ]
    frequencies.sort(key=lambda freq: freq.incident_count, reverse=True)
    return frequencies


def _escalation_episode_minutes(
    assessments_by_zone: list[list[tuple[datetime, str]]],
) -> list[float]:
    """For each zone's ascending (timestamp, tier) sequence, the
    duration of every excursion where tier leaves "normal" and later
    returns to it. An excursion still non-normal at the end of the
    replay window is not counted (its resolution time is unknown, not
    zero - counting it as zero would understate real resolution
    times)."""
    durations: list[float] = []
    for sequence in assessments_by_zone:
        episode_start: datetime | None = None
        for timestamp, tier in sequence:
            if tier != "normal" and episode_start is None:
                episode_start = timestamp
            elif tier == "normal" and episode_start is not None:
                durations.append((timestamp - episode_start).total_seconds() / 60)
                episode_start = None
    return durations


def compute_analytics(session: Session, deck_key: str | None = None) -> CrossScenarioAnalytics:
    decks = (
        HISTORICAL_DECKS if deck_key is None else [d for d in HISTORICAL_DECKS if d.key == deck_key]
    )

    all_ticks: list[IndexedTick] = []
    zone_sequences: dict[tuple[str, object], list[tuple[datetime, str]]] = {}
    incident_keys: set[str] = set()

    for deck in decks:
        for tick in _build_index_for_deck(session, deck):
            all_ticks.append(tick)
            incident_keys.add(tick.incident.scenario_key)
            key = (tick.incident.scenario_key, tick.zone_id)
            zone_sequences.setdefault(key, []).append(
                (tick.assessment.timestamp, tick.assessment.tier)
            )

    for sequence in zone_sequences.values():
        sequence.sort(key=lambda pair: pair[0])

    resolution_minutes = _escalation_episode_minutes(list(zone_sequences.values()))
    average_resolution = (
        sum(resolution_minutes) / len(resolution_minutes) if resolution_minutes else None
    )

    return CrossScenarioAnalytics(
        total_incidents=len(incident_keys),
        total_indexed_ticks=len(all_ticks),
        most_common_causes=_rule_frequencies(all_ticks, allowed_rules=None),
        most_common_equipment_issues=_rule_frequencies(all_ticks, allowed_rules=_EQUIPMENT_RULES),
        most_common_permit_conflicts=_rule_frequencies(all_ticks, allowed_rules=_PERMIT_RULES),
        most_common_worker_hazards=_rule_frequencies(all_ticks, allowed_rules=_WORKER_RULES),
        average_resolution_minutes=average_resolution,
        most_effective_interventions=Unavailable(
            reason=(
                "This platform's scenario replays have no operator-intervention mechanic - "
                "there is no recorded action-then-effect to measure effectiveness against."
            )
        ),
        industry_comparisons=Unavailable(
            reason=(
                "Only one of the 6 registered decks (Demo Plant Incidents) has incident data - "
                "the other 5 industry decks are structurally registered but empty, so there is "
                "no second industry to compare against."
            )
        ),
    )


__all__ = ["RuleFrequency", "Unavailable", "CrossScenarioAnalytics", "compute_analytics", "Lesson"]
