"""Unit tests for src/historical/decks.py - static metadata, no
database.
"""

from src.historical.decks import HISTORICAL_DECKS, all_incidents, get_deck


def test_exactly_one_real_deck_exists() -> None:
    """Per this milestone's explicit design decision: no fabricated
    industry decks, one honest deck wrapping the platform's real
    scenario catalog."""
    assert len(HISTORICAL_DECKS) == 1
    assert HISTORICAL_DECKS[0].key == "demo-plant-incidents"


def test_deck_incidents_reference_all_three_real_scenarios() -> None:
    deck = get_deck("demo-plant-incidents")
    assert deck is not None
    scenario_keys = {incident.scenario_key for incident in deck.incidents}
    assert scenario_keys == {
        "demo_vizag_clairton",
        "scenario_critical_gas_leak",
        "scenario_simops_conflict",
    }


def test_get_deck_returns_none_for_unknown_key() -> None:
    assert get_deck("nonexistent-deck") is None


def test_all_incidents_with_no_filter_returns_every_incident_across_decks() -> None:
    assert len(all_incidents(deck_key=None)) == sum(len(d.incidents) for d in HISTORICAL_DECKS)


def test_all_incidents_filtered_by_deck_key() -> None:
    assert all_incidents(deck_key="demo-plant-incidents") == HISTORICAL_DECKS[0].incidents


def test_all_incidents_unknown_deck_key_returns_empty_not_error() -> None:
    assert all_incidents(deck_key="nonexistent-deck") == []
