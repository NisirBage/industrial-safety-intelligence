"""Scenario catalog - Decision Intelligence Layer.

Read-only listing of ``scenarios/*.yaml`` for the frontend's scenario
library. Reuses the frozen loader
(``src/domain/simulation/scenario.py``) for every structural field it
already validates (seed, start_time, events) rather than
re-implementing any of it - this module adds only what the frozen
``Scenario`` dataclass doesn't carry: a human-readable title/
description (plain extra YAML keys the frozen loader already ignores,
since it reads named keys explicitly and nothing else) and a derived
time range/zone list the frontend needs to query
``GET /risk/history/{zone_id}`` for the right window.

Never runs a scenario, never touches the database - this only reads
static files already committed to the repository.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import yaml

from src.domain.simulation.ids import resolve_id
from src.domain.simulation.scenario import Scenario, load_scenario, validate_structure

SCENARIOS_DIR = Path(__file__).resolve().parents[2] / "scenarios"


@dataclass(frozen=True)
class ScenarioSummary:
    key: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    zone_ids: list[uuid.UUID]
    seed: int


def _end_time(scenario: Scenario, start: datetime) -> datetime:
    """Latest (event start + duration) across sensor events only - a
    permit's own validity window (often hours) is administrative, not
    part of the incident's active timeline, and would otherwise
    dominate the replay window for a scenario whose actual gas
    activity lasts only minutes. Falls back to permit events only if
    a scenario has no sensor events at all, so the window is never
    zero-length."""
    sensor_offsets = [e.sim_time + e.duration_minutes for e in scenario.sensor_events]
    offsets = sensor_offsets or [e.sim_time + e.duration_minutes for e in scenario.permit_events]
    return start + timedelta(minutes=max(offsets, default=0.0))


def _zone_ids(scenario: Scenario) -> list[uuid.UUID]:
    keys = {e.zone_key for e in scenario.sensor_events} | {
        e.zone_key for e in scenario.permit_events
    }
    return sorted((resolve_id(key) for key in keys), key=str)


def _summarize(path: Path) -> ScenarioSummary:
    raw = yaml.safe_load(path.read_text())
    scenario = load_scenario(path)
    validate_structure(scenario)
    start = datetime.fromisoformat(scenario.start_time)
    return ScenarioSummary(
        key=path.stem,
        title=raw.get("title", path.stem),
        description=raw.get("description", ""),
        start_time=start,
        end_time=_end_time(scenario, start),
        zone_ids=_zone_ids(scenario),
        seed=scenario.seed,
    )


def load_catalog() -> list[ScenarioSummary]:
    """Every ``scenarios/*.yaml`` file, ordered by start_time
    (earliest incident first)."""
    summaries = [_summarize(path) for path in sorted(SCENARIOS_DIR.glob("*.yaml"))]
    return sorted(summaries, key=lambda s: s.start_time)


def get_scenario_summary(key: str) -> ScenarioSummary | None:
    for summary in load_catalog():
        if summary.key == key:
            return summary
    return None
