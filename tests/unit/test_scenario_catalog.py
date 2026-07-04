"""Scenario catalog tests (Decision Intelligence Layer).

DB-free: ``src/services/scenario_catalog.py`` only reads
``scenarios/*.yaml`` from disk and calls the frozen loader
(``src/domain/simulation/scenario.py``), so this belongs in
``tests/unit/`` rather than ``tests/integration/`` - no live database
needed, following this project's established unit/integration split.
"""

from datetime import UTC, datetime

from src.domain.simulation.ids import resolve_id
from src.services.scenario_catalog import get_scenario_summary, load_catalog

ZONE_COMPRESSOR_HOUSE = resolve_id("zone-compressor-house")
ZONE_TANK_FARM = resolve_id("zone-tank-farm")


def test_load_catalog_finds_every_authored_scenario_ordered_by_start_time() -> None:
    catalog = load_catalog()
    keys = [s.key for s in catalog]

    assert "demo_vizag_clairton" in keys
    assert "scenario_critical_gas_leak" in keys
    assert "scenario_simops_conflict" in keys
    # earliest start_time first
    assert keys.index("demo_vizag_clairton") < keys.index("scenario_critical_gas_leak")
    assert keys.index("scenario_critical_gas_leak") < keys.index("scenario_simops_conflict")


def test_critical_gas_leak_scenario_metadata() -> None:
    summary = get_scenario_summary("scenario_critical_gas_leak")

    assert summary is not None
    assert summary.title == "Critical Compressor House Gas Leak"
    assert summary.seed == 101
    assert summary.zone_ids == [ZONE_COMPRESSOR_HOUSE]
    assert summary.start_time == datetime(2026, 7, 5, 9, 0, 0, tzinfo=UTC)
    # end_time = start + (sim_time + duration_minutes) of its one sensor event
    assert summary.end_time == datetime(2026, 7, 5, 9, 40, 0, tzinfo=UTC)


def test_simops_conflict_scenario_metadata_uses_sensor_events_for_end_time() -> None:
    """The permit event's own 480-minute validity window must not
    dominate end_time - only sensor-event activity defines the
    incident's replay window (see scenario_catalog._end_time)."""
    summary = get_scenario_summary("scenario_simops_conflict")

    assert summary is not None
    assert summary.zone_ids == [ZONE_TANK_FARM]
    assert summary.end_time == datetime(2026, 7, 10, 10, 0, 0, tzinfo=UTC)


def test_get_scenario_summary_returns_none_for_unknown_key() -> None:
    assert get_scenario_summary("not-a-real-scenario") is None
