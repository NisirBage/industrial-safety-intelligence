"""M24 Parts 1/2 (Historical Knowledge Base / Multiple Decks) - deck
and incident metadata definitions.

This repository has exactly three scenario files under `scenarios/`,
all on the same single simulated demo plant (`tests/fixtures/
demo_plant.json`) - there is no genuine multi-industry data anywhere
in this codebase. Rather than invent Refinery/Petrochemical/LNG/Steel/
Mining decks with fabricated incidents (explicitly rejected - see the
architecture assessment for this milestone), this module defines the
deck system as genuinely multi-deck-capable infrastructure (`list[
HistoricalDeck]`, searchable by key or across all decks), populated
honestly with the one real deck this platform actually has. Adding a
second real deck later means authoring new real scenario YAML files
and a new `HistoricalDeck` entry here - the infrastructure does not
need to change.

Every field below is either copied verbatim from a real scenario file
(`scenario_key`, and via `scenario_catalog.get_scenario_summary` the
title/description/date/zone_ids), or authored narrative commentary
this project's authors wrote about that scenario's own real simulated
mechanics (`root_cause`, the three impact labels) - never a claim
about a real external industrial accident.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HistoricalIncident:
    #: `scenario_catalog.ScenarioSummary.key` this incident replays -
    #: title/description/date/zone_ids are read from there rather than
    #: duplicated here, so the two can never drift apart.
    scenario_key: str

    #: Authored narrative describing this scenario's own simulated
    #: mechanics (what the YAML file's sensor/permit events actually
    #: do) - grounded in the scenario file's own authoring comments,
    #: never a claim about a real external accident.
    root_cause: str

    #: Qualitative-only labels (per this project's standing rule
    #: against fabricated numeric business projections) describing
    #: the kind of impact this incident's real replayed outcome
    #: represents.
    business_impact: str
    operational_impact: str
    safety_impact: str


@dataclass(frozen=True)
class HistoricalDeck:
    key: str
    name: str
    description: str
    incidents: list[HistoricalIncident]


#: The one real deck this platform has data for. See module docstring
#: for why this is not split into industry-labeled decks.
HISTORICAL_DECKS: list[HistoricalDeck] = [
    HistoricalDeck(
        key="demo-plant-incidents",
        name="Demo Plant Incidents",
        description=(
            "Every scenario this platform has actually simulated and replayed, on its one real "
            "demo plant. Not a claim about any real-world industrial site - this deck's incidents "
            "are the platform's own operational memory, exactly as recorded."
        ),
        incidents=[
            HistoricalIncident(
                scenario_key="demo_vizag_clairton",
                root_cause=(
                    "A hot work permit was issued in the Tank Farm while CO pressure began rising "
                    "in the Compressor House - the platform's flagship demonstration scenario, "
                    "exercising permit issuance alongside a genuine gas escalation on the same "
                    "simulated plant."
                ),
                business_impact=(
                    "Reference scenario - the platform's own golden-path regression test."
                ),
                operational_impact=(
                    "Concurrent permit activity and gas escalation across two zones."
                ),
                safety_impact=(
                    "Demonstrates the full pipeline from sensor rise through tier escalation."
                ),
            ),
            HistoricalIncident(
                scenario_key="scenario_critical_gas_leak",
                root_cause=(
                    "A sudden, sustained CO leak in the Compressor House climbed to roughly 3x "
                    "the sensor's own alarm threshold and held there, deliberately severe enough "
                    "to walk the full WATCH -> ELEVATED -> CRITICAL ladder past Tiering's "
                    "dwell-time gate."
                ),
                business_impact=(
                    "Zone-level critical escalation - the kind of event that would halt "
                    "operations in that zone."
                ),
                operational_impact=(
                    "Sustained single-cause gas escalation, no concurrent permit conflict."
                ),
                safety_impact=(
                    "Reached CRITICAL tier; naive single-sensor baseline would also have "
                    "alerted here."
                ),
            ),
            HistoricalIncident(
                scenario_key="scenario_simops_conflict",
                root_cause=(
                    "A slow, gradual CH4 rise in the Tank Farm coincided with a hot work permit "
                    "issued partway through - the SIMOPS/interaction-bonus case Fusion's "
                    "compounding math exists for, where two moderate signals combine into a much "
                    "larger compound score than either alone."
                ),
                business_impact=(
                    "Illustrates a legacy single-sensor alarm system's blind spot in a real "
                    "compounding scenario."
                ),
                operational_impact=(
                    "Concurrent permit + gradual gas rise - a genuine SIMOPS conflict."
                ),
                safety_impact=(
                    "Compound engine escalates while a naive baseline stays silent - the "
                    "exact gap this platform exists to close."
                ),
            ),
        ],
    )
]


def get_deck(key: str) -> HistoricalDeck | None:
    for deck in HISTORICAL_DECKS:
        if deck.key == key:
            return deck
    return None


def all_incidents(deck_key: str | None = None) -> list[HistoricalIncident]:
    """Every incident across all decks, or just one deck if `deck_key`
    is given. `deck_key=None` means "search all decks" (M24 Part 2's
    "search one deck or all decks" requirement)."""
    if deck_key is not None:
        deck = get_deck(deck_key)
        return list(deck.incidents) if deck else []
    return [incident for deck in HISTORICAL_DECKS for incident in deck.incidents]
