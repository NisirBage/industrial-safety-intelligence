"""Unit tests for the pure parts of the Scenario Builder's services
layer - `build_scenario`'s mapping from builder-authored specs to the
frozen `Scenario`/`SensorEvent`/`PermitEvent` dataclasses. No database,
no I/O.
"""

import uuid
from datetime import UTC, datetime

from src.services.scenario_builder import PermitEventSpec, SensorEventSpec, build_scenario

ZONE_ID = uuid.uuid4()
OFFICER_ID = uuid.uuid4()


def test_build_scenario_maps_zone_id_to_zone_key_as_a_plain_string() -> None:
    scenario = build_scenario(
        seed=1,
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        sensor_events=[
            SensorEventSpec(
                name="e1",
                zone_id=ZONE_ID,
                gas_type="CH4",
                sim_time=0,
                duration_minutes=10,
                curve="linear_ramp",
                params={"start_value": 1, "slope": 0.5},
            )
        ],
        permit_events=[],
    )
    assert scenario.sensor_events[0].zone_key == str(ZONE_ID)
    # The round trip this module's whole design depends on: parsing the
    # zone_key back out must reproduce the exact same UUID, never a
    # resolve_id()-derived one.
    assert uuid.UUID(scenario.sensor_events[0].zone_key) == ZONE_ID


def test_build_scenario_maps_authorizing_officer_id_to_a_plain_string() -> None:
    scenario = build_scenario(
        seed=1,
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        sensor_events=[],
        permit_events=[
            PermitEventSpec(
                name="p1",
                zone_id=ZONE_ID,
                sim_time=0,
                permit_type="hot_work",
                authorizing_officer_id=OFFICER_ID,
                duration_minutes=60,
            )
        ],
    )
    assert uuid.UUID(scenario.permit_events[0].authorizing_officer_key) == OFFICER_ID


def test_build_scenario_preserves_every_field_value() -> None:
    scenario = build_scenario(
        seed=42,
        start_time=datetime(2026, 3, 4, 5, 6, 7, tzinfo=UTC),
        sensor_events=[
            SensorEventSpec(
                name="e1",
                zone_id=ZONE_ID,
                gas_type="CO",
                sim_time=5.0,
                duration_minutes=30.0,
                curve="step",
                params={"baseline": 1.0, "step_value": 9.0, "step_time": 10.0},
                sample_interval_minutes=2.0,
            )
        ],
        permit_events=[],
    )
    assert scenario.seed == 42
    assert scenario.start_time == datetime(2026, 3, 4, 5, 6, 7, tzinfo=UTC).isoformat()
    event = scenario.sensor_events[0]
    assert event.name == "e1"
    assert event.gas_type == "CO"
    assert event.sim_time == 5.0
    assert event.duration_minutes == 30.0
    assert event.curve == "step"
    assert event.params == {"baseline": 1.0, "step_value": 9.0, "step_time": 10.0}
    assert event.sample_interval_minutes == 2.0
