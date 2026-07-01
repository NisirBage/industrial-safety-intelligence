"""Worker Exposure Agent tests.

Includes the mathematical invariants from M3C plus the new one M3D
clarification 7 asks for: increasing Gas Risk while holding headcount
constant cannot reduce Worker Exposure risk.
"""

import math
import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.base import AgentInput, AgentResult, Justification
from src.domain.agents.worker_exposure import (
    PermitCoverage,
    WorkerExposureAgent,
    WorkerExposureConfig,
    WorkerPresence,
    calculate_confidence,
    calculate_risk,
    calculate_tier_weight,
    calculate_unauthorized_workers,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = WorkerExposureConfig()


def _gas_risk_result(risk: float) -> AgentResult:
    return AgentResult(
        agent_name="gas_risk",
        risk=risk,
        confidence=1.0,
        justification=Justification(summary="test"),
        computed_at=NOW,
    )


def _make_input(
    context: dict[str, object] | None = None, gas_risk_score: float = 50.0
) -> AgentInput:
    return AgentInput(
        zone_id=ZONE_ID,
        sim_time=NOW,
        tick_id=1,
        context=context or {},
        upstream_results={"gas_risk": _gas_risk_result(gas_risk_score)},
    )


# --- calculate_tier_weight -------------------------------------------------


def test_below_watch_has_zero_weight() -> None:
    assert calculate_tier_weight(20.0, CONFIG) == CONFIG.below_watch_weight


def test_at_watch_threshold_has_watch_weight() -> None:
    assert calculate_tier_weight(40.0, CONFIG) == CONFIG.watch_weight


def test_at_elevated_threshold_has_elevated_weight() -> None:
    assert calculate_tier_weight(65.0, CONFIG) == CONFIG.elevated_weight


def test_at_critical_threshold_has_critical_weight() -> None:
    assert calculate_tier_weight(85.0, CONFIG) == CONFIG.critical_weight


def test_just_below_each_threshold_uses_the_lower_tier() -> None:
    assert calculate_tier_weight(64.999, CONFIG) == CONFIG.watch_weight
    assert calculate_tier_weight(84.999, CONFIG) == CONFIG.elevated_weight


# --- calculate_risk ----------------------------------------------------------


def test_risk_is_zero_with_zero_tier_weight() -> None:
    assert calculate_risk(headcount=10, tier_weight=0.0, config=CONFIG) == 0.0


def test_risk_is_zero_with_zero_headcount() -> None:
    assert calculate_risk(headcount=0, tier_weight=4.0, config=CONFIG) == 0.0


def test_risk_at_half_weighted_exposure_is_exactly_fifty() -> None:
    risk = calculate_risk(headcount=1, tier_weight=0.5, config=CONFIG)
    assert risk == pytest.approx(50.0)


def test_risk_at_full_weighted_exposure_is_seventy_five() -> None:
    risk = calculate_risk(headcount=1, tier_weight=1.0, config=CONFIG)
    assert risk == pytest.approx(75.0)


def test_config_steepness_k_matches_documented_derivation() -> None:
    assert WorkerExposureConfig().steepness_k == pytest.approx(2 * math.log(2))


# --- calculate_unauthorized_workers -------------------------------------------


def _worker(identifier: str = "w1", role: str = "operator") -> WorkerPresence:
    return WorkerPresence(identifier=identifier, role=role)


def test_no_unauthorized_workers_with_active_permit() -> None:
    workers = [_worker()]
    result = calculate_unauthorized_workers(
        workers, gas_risk_score=90.0, permit_coverage=PermitCoverage(True), config=CONFIG
    )
    assert result == []


def test_no_unauthorized_workers_below_watch_even_without_permit() -> None:
    workers = [_worker()]
    result = calculate_unauthorized_workers(
        workers, gas_risk_score=10.0, permit_coverage=PermitCoverage(False), config=CONFIG
    )
    assert result == []


def test_unauthorized_workers_flagged_when_elevated_and_uncovered() -> None:
    workers = [_worker("w1", "operator"), _worker("w2", "safety_officer")]
    result = calculate_unauthorized_workers(
        workers, gas_risk_score=70.0, permit_coverage=PermitCoverage(False), config=CONFIG
    )
    assert result == workers


# --- Invariants ---------------------------------------------------------------


def test_invariant_bounded_risk() -> None:
    for headcount in (0, 1, 5, 20):
        for tier_weight in (0.0, 1.0, 2.0, 4.0):
            risk = calculate_risk(headcount, tier_weight, CONFIG)
            assert 0.0 <= risk <= 100.0


def test_invariant_monotonicity_increasing_headcount_never_decreases_risk() -> None:
    risks = [calculate_risk(n, tier_weight=2.0, config=CONFIG) for n in range(6)]
    assert risks == sorted(risks)
    assert risks[0] < risks[-1]


def test_invariant_monotonicity_increasing_gas_risk_never_decreases_exposure() -> None:
    """M3D clarification 7: holding headcount constant, a higher Gas
    Risk score can never produce a lower Worker Exposure risk."""
    headcount = 3
    gas_risk_scores = [0.0, 20.0, 40.0, 65.0, 85.0, 100.0]
    risks = [
        calculate_risk(headcount, calculate_tier_weight(score, CONFIG), CONFIG)
        for score in gas_risk_scores
    ]
    assert risks == sorted(risks)
    assert risks[0] < risks[-1]


def test_invariant_confidence_bounds_and_ordering() -> None:
    missing = calculate_confidence(context_present=False, config=CONFIG)
    present = calculate_confidence(context_present=True, config=CONFIG)
    assert 0.0 <= missing <= 1.0
    assert 0.0 <= present <= 1.0
    assert missing < present


# --- WorkerExposureAgent (full evaluate()) ------------------------------------


async def test_evaluate_missing_location_uses_fail_safe_headcount() -> None:
    agent = WorkerExposureAgent()
    result = await agent.evaluate(_make_input(context=None, gas_risk_score=70.0))
    assert result.confidence == CONFIG.missing_context_confidence
    assert result.justification.rules_fired == ["missing_location_fail_safe"]
    expected_risk = calculate_risk(CONFIG.fail_safe_assumed_headcount, 2.0, CONFIG)
    assert result.risk == pytest.approx(expected_risk)
    assert result.justification.evidence["unauthorized_workers"] == []


async def test_evaluate_confirmed_present_workers() -> None:
    agent = WorkerExposureAgent()
    result = await agent.evaluate(
        _make_input(
            context={"workers_present": [_worker("w1"), _worker("w2")]}, gas_risk_score=70.0
        )
    )
    assert result.confidence == 1.0
    assert result.justification.evidence["headcount"] == 2
    assert result.justification.evidence["tier_weight"] == CONFIG.elevated_weight


async def test_evaluate_flags_unauthorized_workers_with_roles() -> None:
    agent = WorkerExposureAgent()
    result = await agent.evaluate(
        _make_input(
            context={
                "workers_present": [_worker("w1", "operator")],
                "permit_coverage": PermitCoverage(has_active_permit=False),
            },
            gas_risk_score=70.0,
        )
    )
    assert result.justification.rules_fired == [
        "exposure_weighted_headcount",
        "unauthorized_presence",
    ]
    assert result.justification.evidence["unauthorized_workers"] == [
        {"identifier": "w1", "role": "operator"}
    ]


async def test_evaluate_no_unauthorized_flag_with_active_permit() -> None:
    agent = WorkerExposureAgent()
    result = await agent.evaluate(
        _make_input(
            context={
                "workers_present": [_worker("w1")],
                "permit_coverage": PermitCoverage(has_active_permit=True),
            },
            gas_risk_score=90.0,
        )
    )
    assert result.justification.evidence["unauthorized_workers"] == []
    assert result.justification.rules_fired == ["exposure_weighted_headcount"]


async def test_evaluate_raises_when_gas_risk_upstream_result_missing() -> None:
    """A missing Tier-0 result is a scheduler bug, not domain
    uncertainty - it must propagate, never silently default to a
    falsely safe score."""
    agent = WorkerExposureAgent()
    bad_input = AgentInput(zone_id=ZONE_ID, sim_time=NOW, tick_id=1, upstream_results={})
    with pytest.raises(KeyError):
        await agent.evaluate(bad_input)


async def test_evaluate_is_deterministic() -> None:
    agent = WorkerExposureAgent()
    input_ = _make_input(context={"workers_present": [_worker()]}, gas_risk_score=70.0)
    first = await agent.evaluate(input_)
    second = await agent.evaluate(input_)
    assert first == second
