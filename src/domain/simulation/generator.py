"""Pure event-sequence generation from a Scenario.

Exists as the one place that turns a validated ``Scenario`` into the
actual sequence of readings/permits it describes, using only
``SimClock``, the curve registry, and deterministic id resolution -
no repositories, no session, no logging. Kept separate from
``src/services/simulation_runner.py`` specifically so
``tests/unit/test_generator_reproducibility.py`` can call it directly
and assert byte-identical output without a database, which is exactly
what M2's completion criterion asks for.

``src/services/simulation_runner.py`` is the only consumer: it calls
these two functions and persists their output through M1's
repositories.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from src.domain.simulation.clock import SimClock
from src.domain.simulation.curves import CURVE_REGISTRY
from src.domain.simulation.ids import resolve_id
from src.domain.simulation.scenario import Scenario


@dataclass(frozen=True)
class GeneratedReading:
    reading_id: uuid.UUID
    zone_key: str
    gas_type: str
    value: float
    timestamp: datetime


@dataclass(frozen=True)
class GeneratedPermit:
    permit_id: uuid.UUID
    zone_key: str
    permit_type: str
    authorizing_officer_key: str
    issued_at: datetime
    expires_at: datetime


def generate_sensor_readings(scenario: Scenario) -> list[GeneratedReading]:
    """Compute every reading a scenario's sensor_events produce, in order.

    Deterministic: the same scenario (same seed) always produces the
    same list, in the same order, with the same ids.
    """
    clock = SimClock(datetime.fromisoformat(scenario.start_time))
    readings: list[GeneratedReading] = []

    for event in sorted(scenario.sensor_events, key=lambda e: e.sim_time):
        clock.reset()
        clock.advance(event.sim_time)
        curve_fn = CURVE_REGISTRY[event.curve]
        num_steps = int(event.duration_minutes // event.sample_interval_minutes)

        for tick_index in range(num_steps + 1):
            t = tick_index * event.sample_interval_minutes
            value = curve_fn(t, event.params)
            readings.append(
                GeneratedReading(
                    reading_id=resolve_id(f"reading:{scenario.seed}:{event.name}:{tick_index}"),
                    zone_key=event.zone_key,
                    gas_type=event.gas_type,
                    value=value,
                    timestamp=clock.now(),
                )
            )
            clock.advance(event.sample_interval_minutes)

    return readings


def generate_permits(scenario: Scenario) -> list[GeneratedPermit]:
    """Compute every permit a scenario's permit_events produce."""
    start = datetime.fromisoformat(scenario.start_time)
    permits: list[GeneratedPermit] = []

    for event in scenario.permit_events:
        issued_at = start + timedelta(minutes=event.sim_time)
        expires_at = issued_at + timedelta(minutes=event.duration_minutes)
        permits.append(
            GeneratedPermit(
                permit_id=resolve_id(f"permit:{scenario.seed}:{event.name}"),
                zone_key=event.zone_key,
                permit_type=event.permit_type,
                authorizing_officer_key=event.authorizing_officer_key,
                issued_at=issued_at,
                expires_at=expires_at,
            )
        )

    return permits
