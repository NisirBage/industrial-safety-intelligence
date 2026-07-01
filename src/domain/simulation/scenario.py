"""Scenario schema, YAML loader, and structural validation.

Exists because ``scenarios/*.yaml`` files are, per the Master Plan,
"the demo script AND the test fixture, same file" - this module is
the one place that shape is defined and checked, so the live demo and
M5's golden-scenario regression test can never silently drift apart
by each parsing the file differently.

Only *structural* validation lives here (curve type known, required
params present, event names unique, values sane) - all of it pure,
no I/O, consistent with the domain layer having zero I/O. Whether a
scenario's referenced zones/sensors/workers actually exist in the
database is a separate, repository-backed check that belongs in
``src/services/simulation_runner.py``, which is allowed to touch
infra; this module is not.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from src.domain.simulation.curves import CURVE_REGISTRY, CURVE_REQUIRED_PARAMS


class ScenarioValidationError(ValueError):
    """Raised when a scenario file is structurally or referentially invalid."""


@dataclass(frozen=True)
class SensorEvent:
    name: str
    zone_key: str
    gas_type: str
    sim_time: float
    duration_minutes: float
    curve: str
    params: dict[str, float]
    sample_interval_minutes: float = 1.0


@dataclass(frozen=True)
class PermitEvent:
    name: str
    zone_key: str
    sim_time: float
    permit_type: str
    authorizing_officer_key: str
    duration_minutes: float


@dataclass(frozen=True)
class Scenario:
    seed: int
    start_time: str  # ISO 8601; parsed where a datetime is actually needed
    sensor_events: list[SensorEvent] = field(default_factory=list)
    permit_events: list[PermitEvent] = field(default_factory=list)


def _require(mapping: dict[str, Any], key: str, context: str) -> Any:
    if key not in mapping:
        raise ScenarioValidationError(f"{context}: missing required field {key!r}")
    return mapping[key]


def load_scenario(path: Path) -> Scenario:
    """Parse a scenario YAML file into a ``Scenario``. Does not validate it."""
    raw: dict[str, Any] = yaml.safe_load(path.read_text())

    sensor_events = [
        SensorEvent(
            name=_require(e, "name", "sensor_events"),
            zone_key=_require(e, "zone", e.get("name", "<unnamed>")),
            gas_type=_require(e, "gas_type", e.get("name", "<unnamed>")),
            sim_time=_require(e, "sim_time", e.get("name", "<unnamed>")),
            duration_minutes=_require(e, "duration_minutes", e.get("name", "<unnamed>")),
            curve=_require(e, "curve", e.get("name", "<unnamed>")),
            params=_require(e, "params", e.get("name", "<unnamed>")),
            sample_interval_minutes=e.get("sample_interval_minutes", 1.0),
        )
        for e in raw.get("sensor_events", [])
    ]

    permit_events = [
        PermitEvent(
            name=_require(e, "name", "permit_events"),
            zone_key=_require(e, "zone", e.get("name", "<unnamed>")),
            sim_time=_require(e, "sim_time", e.get("name", "<unnamed>")),
            permit_type=_require(e, "permit_type", e.get("name", "<unnamed>")),
            authorizing_officer_key=_require(e, "authorizing_officer", e.get("name", "<unnamed>")),
            duration_minutes=_require(e, "duration_minutes", e.get("name", "<unnamed>")),
        )
        for e in raw.get("permit_events", [])
    ]

    return Scenario(
        seed=_require(raw, "seed", "scenario"),
        start_time=_require(raw, "start_time", "scenario"),
        sensor_events=sensor_events,
        permit_events=permit_events,
    )


def validate_structure(scenario: Scenario) -> None:
    """Self-contained checks only - no repository or database access.

    Covers: event-name uniqueness, curve type validity, required
    curve parameters, and basic numeric sanity. Referential checks
    (do the referenced zones/sensors/workers exist) happen in
    src/services/simulation_runner.py.
    """
    seen_names: set[str] = set()
    for event_name in [e.name for e in scenario.sensor_events] + [
        e.name for e in scenario.permit_events
    ]:
        if event_name in seen_names:
            raise ScenarioValidationError(f"duplicate event name: {event_name!r}")
        seen_names.add(event_name)

    for sensor_event in scenario.sensor_events:
        if sensor_event.sim_time < 0:
            raise ScenarioValidationError(f"event {sensor_event.name!r}: sim_time must be >= 0")
        if sensor_event.duration_minutes <= 0:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: duration_minutes must be > 0"
            )
        if sensor_event.sample_interval_minutes <= 0:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: sample_interval_minutes must be > 0"
            )
        if sensor_event.curve not in CURVE_REGISTRY:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: unknown curve type {sensor_event.curve!r} "
                f"(known: {sorted(CURVE_REGISTRY)})"
            )
        required = CURVE_REQUIRED_PARAMS[sensor_event.curve]
        missing = [p for p in required if p not in sensor_event.params]
        if missing:
            raise ScenarioValidationError(
                f"event {sensor_event.name!r}: curve {sensor_event.curve!r} "
                f"missing params {missing}"
            )

    for permit_event in scenario.permit_events:
        if permit_event.sim_time < 0:
            raise ScenarioValidationError(f"event {permit_event.name!r}: sim_time must be >= 0")
        if permit_event.duration_minutes <= 0:
            raise ScenarioValidationError(
                f"event {permit_event.name!r}: duration_minutes must be > 0"
            )
