"""Scenario YAML loading and structural validation.

Uses the real authored demo scenario for the happy path, and small
inline temp files for the negative cases - none of this needs a
database.
"""

from pathlib import Path

import pytest

from src.domain.simulation.scenario import (
    ScenarioValidationError,
    load_scenario,
    validate_structure,
)

DEMO_SCENARIO = Path(__file__).resolve().parents[2] / "scenarios" / "demo_vizag_clairton.yaml"


def test_loads_and_validates_the_demo_scenario() -> None:
    scenario = load_scenario(DEMO_SCENARIO)
    validate_structure(scenario)
    assert scenario.seed == 42
    assert len(scenario.sensor_events) == 2
    assert len(scenario.permit_events) == 1


def test_rejects_unknown_curve_type(tmp_path: Path) -> None:
    scenario_file = tmp_path / "bad.yaml"
    scenario_file.write_text(
        """
seed: 1
start_time: "2026-01-01T00:00:00+00:00"
sensor_events:
  - name: bad_event
    zone: zone-x
    gas_type: CO
    sim_time: 0
    duration_minutes: 10
    curve: not_a_real_curve
    params: {}
"""
    )
    scenario = load_scenario(scenario_file)
    with pytest.raises(ScenarioValidationError, match="unknown curve type"):
        validate_structure(scenario)


def test_rejects_missing_curve_params(tmp_path: Path) -> None:
    scenario_file = tmp_path / "bad.yaml"
    scenario_file.write_text(
        """
seed: 1
start_time: "2026-01-01T00:00:00+00:00"
sensor_events:
  - name: bad_event
    zone: zone-x
    gas_type: CO
    sim_time: 0
    duration_minutes: 10
    curve: exponential_rise
    params: {start_value: 5}
"""
    )
    scenario = load_scenario(scenario_file)
    with pytest.raises(ScenarioValidationError, match="missing params"):
        validate_structure(scenario)


def test_rejects_duplicate_event_names(tmp_path: Path) -> None:
    scenario_file = tmp_path / "bad.yaml"
    scenario_file.write_text(
        """
seed: 1
start_time: "2026-01-01T00:00:00+00:00"
sensor_events:
  - name: dup
    zone: zone-x
    gas_type: CO
    sim_time: 0
    duration_minutes: 10
    curve: step
    params: {baseline: 1, step_value: 2, step_time: 5}
permit_events:
  - name: dup
    zone: zone-x
    sim_time: 0
    permit_type: hot_work
    authorizing_officer: worker-x
    duration_minutes: 60
"""
    )
    scenario = load_scenario(scenario_file)
    with pytest.raises(ScenarioValidationError, match="duplicate event name"):
        validate_structure(scenario)
