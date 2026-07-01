"""Permit Reasoning Framework (M4A) tests.

Tests representations and pure policy/decision helpers only - there is
no agent class yet (M4B), so nothing here touches AgentInput/AgentResult.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.permit_intelligence import (
    AdjacentZoneStatus,
    PermitBaselineSnapshot,
    PermitReasoningConfig,
    PermitRecord,
    assess_baseline_delta,
    detect_simops_conflicts,
)

NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = PermitReasoningConfig()
ZONE_ID = uuid.uuid4()
ADJACENT_ZONE_ID = uuid.uuid4()


def _baseline(gas_risk: float = 30.0, confidence: float = 1.0) -> PermitBaselineSnapshot:
    return PermitBaselineSnapshot(
        schema_version=1,
        algorithm_version=1,
        gas_risk_at_issuance=gas_risk,
        confidence_at_issuance=confidence,
        captured_at=NOW,
    )


# --- Representations (observed facts) ----------------------------------------


def test_permit_record_constructs_with_baseline() -> None:
    record = PermitRecord(
        identifier="permit-1",
        permit_type="hot_work",
        zone_id=ZONE_ID,
        status="active",
        baseline=_baseline(),
    )
    assert record.status == "active"
    assert record.baseline.gas_risk_at_issuance == 30.0


def test_adjacent_zone_status_constructs() -> None:
    status = AdjacentZoneStatus(
        zone_id=ADJACENT_ZONE_ID,
        active_permit_types=frozenset({"confined_space"}),
        gas_risk_score=70.0,
    )
    assert "confined_space" in status.active_permit_types


# --- assess_baseline_delta (configurable policy applied to facts) ------------


def test_delta_below_threshold_is_not_exceeded() -> None:
    assessment = assess_baseline_delta(_baseline(gas_risk=30.0), live_gas_risk=40.0, config=CONFIG)
    assert assessment.delta == pytest.approx(10.0)
    assert assessment.exceeded is False


def test_delta_exactly_at_threshold_is_not_exceeded() -> None:
    """Strictly greater-than, not greater-or-equal - a delta exactly
    at the threshold is not yet a violation of it."""
    assessment = assess_baseline_delta(_baseline(gas_risk=30.0), live_gas_risk=50.0, config=CONFIG)
    assert assessment.delta == pytest.approx(CONFIG.risk_delta_threshold)
    assert assessment.exceeded is False


def test_delta_above_threshold_is_exceeded() -> None:
    assessment = assess_baseline_delta(_baseline(gas_risk=30.0), live_gas_risk=51.0, config=CONFIG)
    assert assessment.exceeded is True


def test_negative_delta_is_not_exceeded() -> None:
    """Risk that has fallen since issuance is never a violation."""
    assessment = assess_baseline_delta(_baseline(gas_risk=50.0), live_gas_risk=10.0, config=CONFIG)
    assert assessment.delta < 0
    assert assessment.exceeded is False


def test_invariant_baseline_delta_monotonicity() -> None:
    """Once exceeded becomes True as live_gas_risk rises, it never
    reverts to False for any higher live_gas_risk value."""
    baseline = _baseline(gas_risk=30.0)
    live_values = [30.0, 40.0, 50.0, 50.1, 60.0, 100.0]
    exceeded_flags = [assess_baseline_delta(baseline, v, CONFIG).exceeded for v in live_values]
    first_true = next((i for i, flag in enumerate(exceeded_flags) if flag), None)
    if first_true is not None:
        assert all(exceeded_flags[first_true:])


# --- detect_simops_conflicts --------------------------------------------------


def test_no_conflicts_with_no_adjacent_zones() -> None:
    assert detect_simops_conflicts("hot_work", [], CONFIG) == []


def test_no_conflict_when_adjacent_zone_risk_is_low() -> None:
    adjacent = AdjacentZoneStatus(
        zone_id=ADJACENT_ZONE_ID,
        active_permit_types=frozenset({"confined_space"}),
        gas_risk_score=30.0,  # below adjacent_zone_elevated_threshold
    )
    assert detect_simops_conflicts("hot_work", [adjacent], CONFIG) == []


def test_no_conflict_when_permit_types_are_compatible() -> None:
    adjacent = AdjacentZoneStatus(
        zone_id=ADJACENT_ZONE_ID,
        active_permit_types=frozenset({"electrical_isolation"}),
        gas_risk_score=90.0,
    )
    assert detect_simops_conflicts("hot_work", [adjacent], CONFIG) == []


def test_no_conflict_for_same_permit_type_in_adjacent_zone() -> None:
    adjacent = AdjacentZoneStatus(
        zone_id=ADJACENT_ZONE_ID,
        active_permit_types=frozenset({"hot_work"}),
        gas_risk_score=90.0,
    )
    assert detect_simops_conflicts("hot_work", [adjacent], CONFIG) == []


def test_conflict_detected_for_incompatible_pair_with_elevated_risk() -> None:
    adjacent = AdjacentZoneStatus(
        zone_id=ADJACENT_ZONE_ID,
        active_permit_types=frozenset({"confined_space"}),
        gas_risk_score=70.0,
    )
    conflicts = detect_simops_conflicts("hot_work", [adjacent], CONFIG)
    assert len(conflicts) == 1
    assert conflicts[0].adjacent_zone_id == ADJACENT_ZONE_ID
    assert conflicts[0].permit_type == "hot_work"
    assert conflicts[0].conflicting_permit_type == "confined_space"
    assert conflicts[0].adjacent_gas_risk == 70.0


def test_multiple_adjacent_zones_produce_multiple_conflicts() -> None:
    zone_b = uuid.uuid4()
    adjacent_a = AdjacentZoneStatus(ADJACENT_ZONE_ID, frozenset({"confined_space"}), 70.0)
    adjacent_b = AdjacentZoneStatus(zone_b, frozenset({"confined_space"}), 90.0)
    conflicts = detect_simops_conflicts("hot_work", [adjacent_a, adjacent_b], CONFIG)
    assert len(conflicts) == 2


def test_invariant_conflict_count_never_decreases_with_more_adjacent_zones() -> None:
    zones: list[AdjacentZoneStatus] = []
    counts = []
    for _i in range(4):
        zones.append(AdjacentZoneStatus(uuid.uuid4(), frozenset({"confined_space"}), 70.0))
        counts.append(len(detect_simops_conflicts("hot_work", zones, CONFIG)))
    assert counts == sorted(counts)
    assert counts[0] < counts[-1]


def test_config_incompatible_pairs_is_independent_from_defaults() -> None:
    """Policy lives in config, not hardcoded in the helper (M4A
    clarification 4) - a custom config can define a different pair."""
    custom_config = PermitReasoningConfig(
        incompatible_permit_pairs=frozenset({frozenset({"line_break", "electrical_isolation"})})
    )
    adjacent = AdjacentZoneStatus(ADJACENT_ZONE_ID, frozenset({"electrical_isolation"}), 90.0)
    # Not a conflict under the default config's pairs...
    assert detect_simops_conflicts("line_break", [adjacent], CONFIG) == []
    # ...but is under the custom config's pairs.
    assert len(detect_simops_conflicts("line_break", [adjacent], custom_config)) == 1
