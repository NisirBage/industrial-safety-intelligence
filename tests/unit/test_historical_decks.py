"""Unit tests for src/historical/decks.py - static metadata, no
database.
"""

from src.historical.decks import HISTORICAL_DECKS, all_incidents, get_deck


def test_exactly_one_deck_has_incident_data() -> None:
    """Per this milestone's explicit design decision: no fabricated
    industry decks. M28 Part 10 registered 7 total decks (the 1 real
    deck plus 6 industry stubs - Oil Refinery, Steel, Chemical,
    Mining, Power, LNG - proving the multi-deck architecture is
    genuinely industry-generic), but only the one real deck wrapping
    the platform's actual scenario catalog has any incidents - the
    other 6 are honestly empty stubs."""
    assert len(HISTORICAL_DECKS) == 7
    decks_with_data = [deck for deck in HISTORICAL_DECKS if deck.incidents]
    assert len(decks_with_data) == 1
    assert decks_with_data[0].key == "demo-plant-incidents"


def test_stub_decks_are_registered_and_honestly_empty() -> None:
    stub_keys = {"oil-refinery", "steel", "chemical", "mining", "power", "lng"}
    for key in stub_keys:
        deck = get_deck(key)
        assert deck is not None
        assert deck.incidents == []
        assert "no incident data modeled yet" in deck.description


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
