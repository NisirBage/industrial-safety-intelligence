"""M2's mandated reproducibility test: same seed -> byte-identical output.

Targets src/domain/simulation/generator.py directly - pure functions,
no database - which is exactly why generator.py was kept separate
from src/services/simulation_runner.py.
"""

from pathlib import Path

from src.domain.simulation.generator import generate_permits, generate_sensor_readings
from src.domain.simulation.scenario import load_scenario

DEMO_SCENARIO = Path(__file__).resolve().parents[2] / "scenarios" / "demo_vizag_clairton.yaml"


def test_two_runs_with_same_seed_produce_identical_readings() -> None:
    scenario = load_scenario(DEMO_SCENARIO)
    first_run = generate_sensor_readings(scenario)
    second_run = generate_sensor_readings(scenario)
    assert first_run == second_run
    assert len(first_run) > 0


def test_two_runs_with_same_seed_produce_identical_permits() -> None:
    scenario = load_scenario(DEMO_SCENARIO)
    first_run = generate_permits(scenario)
    second_run = generate_permits(scenario)
    assert first_run == second_run
    assert len(first_run) > 0
