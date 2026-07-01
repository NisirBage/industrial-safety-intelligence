"""Equipment Status Agent tests.

Includes explicit mathematical invariants (monotonicity, confidence
consistency, bounded risk) per M3C clarification 6, not just example
cases.
"""

import json
import math
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from src.domain.agents.base import AgentInput
from src.domain.agents.equipment_status import (
    EquipmentRecord,
    EquipmentStatusAgent,
    EquipmentStatusConfig,
    calculate_confidence,
    calculate_degraded_groups,
    calculate_risk,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = EquipmentStatusConfig()
DEMO_PLANT_FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "demo_plant.json"


def _make_input(context: dict[str, object]) -> AgentInput:
    return AgentInput(zone_id=ZONE_ID, sim_time=NOW, tick_id=1, context=context)


def _record(
    identifier: str,
    equipment_type: str,
    isolation_status: str = "active",
    maintenance_flag: bool = False,
    loto_confirmed: bool = False,
) -> EquipmentRecord:
    return EquipmentRecord(
        identifier, equipment_type, isolation_status, maintenance_flag, loto_confirmed
    )


# --- calculate_degraded_groups (common-cause heuristic) ------------------


def test_active_equipment_is_not_degraded() -> None:
    equipment = [_record("e1", "valve")]
    assert calculate_degraded_groups(equipment) == frozenset()


def test_isolated_status_counts_as_degraded() -> None:
    equipment = [_record("e1", "valve", isolation_status="isolated")]
    assert calculate_degraded_groups(equipment) == frozenset({"valve"})


def test_maintenance_flag_counts_as_degraded() -> None:
    equipment = [_record("e1", "valve", maintenance_flag=True)]
    assert calculate_degraded_groups(equipment) == frozenset({"valve"})


def test_loto_confirmed_counts_as_degraded() -> None:
    equipment = [_record("e1", "valve", loto_confirmed=True)]
    assert calculate_degraded_groups(equipment) == frozenset({"valve"})


def test_same_type_degraded_records_collapse_to_one_group() -> None:
    """The common-cause heuristic: two degraded valves are one group,
    not two independent degradations."""
    equipment = [
        _record("e1", "valve", isolation_status="degraded"),
        _record("e2", "valve", maintenance_flag=True),
    ]
    assert calculate_degraded_groups(equipment) == frozenset({"valve"})


def test_distinct_types_produce_distinct_groups() -> None:
    equipment = [
        _record("e1", "valve", isolation_status="degraded"),
        _record("e2", "compressor", maintenance_flag=True),
    ]
    assert calculate_degraded_groups(equipment) == frozenset({"valve", "compressor"})


def test_unrecognized_isolation_status_raises() -> None:
    equipment = [_record("e1", "valve", isolation_status="on_fire")]
    with pytest.raises(ValueError, match="unrecognized isolation_status"):
        calculate_degraded_groups(equipment)


# --- calculate_risk -------------------------------------------------------


def test_risk_is_zero_with_no_types() -> None:
    assert calculate_risk(degraded_group_count=0, total_type_count=0, config=CONFIG) == 0.0


def test_risk_is_zero_with_no_degraded_groups() -> None:
    assert calculate_risk(degraded_group_count=0, total_type_count=3, config=CONFIG) == 0.0


def test_risk_at_half_degraded_ratio_is_exactly_fifty() -> None:
    risk = calculate_risk(degraded_group_count=1, total_type_count=2, config=CONFIG)
    assert risk == pytest.approx(50.0)


def test_risk_at_full_degraded_ratio_is_seventy_five() -> None:
    """Same saturating shape as Gas Risk: full ratio doesn't hit 100."""
    risk = calculate_risk(degraded_group_count=2, total_type_count=2, config=CONFIG)
    assert risk == pytest.approx(75.0)


def test_equipment_config_steepness_k_matches_documented_derivation() -> None:
    assert EquipmentStatusConfig().steepness_k == pytest.approx(2 * math.log(2))


# --- Invariants (M3C clarification 6) -------------------------------------


def test_invariant_bounded_risk() -> None:
    cases = [(0, 0), (0, 5), (1, 1), (1, 5), (3, 5), (5, 5)]
    for degraded, total in cases:
        risk = calculate_risk(degraded, total, CONFIG)
        assert 0.0 <= risk <= 100.0


def test_invariant_monotonicity_more_degraded_groups_never_decreases_risk() -> None:
    total = 5
    risks = [calculate_risk(n, total, CONFIG) for n in range(total + 1)]
    assert risks == sorted(risks)
    assert risks[0] < risks[-1]


def test_invariant_same_type_dedup_does_not_increase_risk() -> None:
    """Adding a second degraded record of an already-degraded type must
    not move the risk at all - it's the same group, not a new one."""
    one_degraded = [_record("e1", "valve", isolation_status="degraded")]
    two_same_type_degraded = [
        _record("e1", "valve", isolation_status="degraded"),
        _record("e2", "valve", maintenance_flag=True),
    ]
    groups_one = calculate_degraded_groups(one_degraded)
    groups_two = calculate_degraded_groups(two_same_type_degraded)
    risk_one = calculate_risk(len(groups_one), 1, CONFIG)
    risk_two = calculate_risk(len(groups_two), 1, CONFIG)
    assert risk_one == risk_two


def test_invariant_confidence_bounds_and_ordering() -> None:
    missing = calculate_confidence(context_present=False, equipment=[], config=CONFIG)
    confirmed_empty = calculate_confidence(context_present=True, equipment=[], config=CONFIG)
    confirmed_present = calculate_confidence(
        context_present=True, equipment=[_record("e1", "valve")], config=CONFIG
    )
    for value in (missing, confirmed_empty, confirmed_present):
        assert 0.0 <= value <= 1.0
    assert missing < confirmed_empty
    assert missing < confirmed_present


# --- EquipmentStatusAgent (full evaluate()) -------------------------------


async def test_evaluate_missing_equipment_context() -> None:
    """No 'equipment' key at all - distinct from a present, empty list."""
    agent = EquipmentStatusAgent()
    result = await agent.evaluate(_make_input({}))
    assert result.risk == 0.0
    assert result.confidence == CONFIG.missing_context_confidence
    assert result.justification.rules_fired == ["missing_equipment_context"]


async def test_evaluate_confirmed_empty_inventory() -> None:
    """'equipment': [] - a confirmed fact, not missing information."""
    agent = EquipmentStatusAgent()
    result = await agent.evaluate(_make_input({"equipment": []}))
    assert result.risk == 0.0
    assert result.confidence == 1.0
    assert result.justification.rules_fired == ["confirmed_empty_inventory"]


async def test_evaluate_no_degradation() -> None:
    agent = EquipmentStatusAgent()
    result = await agent.evaluate(
        _make_input({"equipment": [_record("e1", "valve"), _record("e2", "compressor")]})
    )
    assert result.risk == 0.0
    assert result.confidence == 1.0
    assert result.justification.rules_fired == ["no_degradation"]


async def test_evaluate_with_degradation_matches_formula() -> None:
    agent = EquipmentStatusAgent()
    result = await agent.evaluate(
        _make_input(
            {
                "equipment": [
                    _record("e1", "valve", isolation_status="isolated"),
                    _record("e2", "compressor"),
                ]
            }
        )
    )
    assert result.risk == pytest.approx(50.0)
    assert result.confidence == 1.0
    assert result.justification.rules_fired == ["common_cause_grouped_degradation_count"]
    assert result.justification.evidence["degraded_protection_layer_groups"] == ["valve"]


async def test_evaluate_is_deterministic() -> None:
    agent = EquipmentStatusAgent()
    input_ = _make_input({"equipment": [_record("e1", "valve", isolation_status="degraded")]})
    first = await agent.evaluate(input_)
    second = await agent.evaluate(input_)
    assert first == second


async def test_evaluate_against_m1_seed_fixture() -> None:
    """Realism check using M1's demo plant equipment records directly."""
    data = json.loads(DEMO_PLANT_FIXTURE.read_text())
    equipment = [
        EquipmentRecord(
            identifier=e["id"],
            equipment_type=e["equipment_type"],
            isolation_status=e["isolation_status"],
            maintenance_flag=False,
            loto_confirmed=False,
        )
        for e in data["equipment"]
    ]
    agent = EquipmentStatusAgent()
    result = await agent.evaluate(_make_input({"equipment": equipment}))
    # demo_plant.json has one active compressor and one isolated valve:
    # 1 of 2 distinct types degraded -> ratio 0.5 -> risk 50.0.
    assert result.risk == pytest.approx(50.0)
    assert 0.0 <= result.confidence <= 1.0
