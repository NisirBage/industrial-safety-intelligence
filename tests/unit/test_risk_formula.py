"""Fusion Engine (M5B) tests.

Every multi-signal case below is independently hand-computed (shown
in comments) against the exact formulas in risk_formula.py, per M5B
clarification 9 - not derived from the code under test.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.base import AgentResult, Justification
from src.domain.orchestrator.risk_formula import (
    FusionConfig,
    calculate_agent_contributions,
    calculate_compound_confidence,
    calculate_compound_risk,
    calculate_interaction_multiplier,
    calculate_weighted_base_score,
    fuse,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = FusionConfig()


def _result(risk: float, confidence: float = 1.0) -> AgentResult:
    return AgentResult(
        agent_name="test",
        risk=risk,
        confidence=confidence,
        justification=Justification(summary="test"),
        computed_at=NOW,
    )


def _results(
    gas_risk: float, permit_intelligence: float, worker_exposure: float, equipment_status: float
) -> dict[str, AgentResult]:
    return {
        "gas_risk": _result(gas_risk),
        "permit_intelligence": _result(permit_intelligence),
        "worker_exposure": _result(worker_exposure),
        "equipment_status": _result(equipment_status),
    }


# --- FusionConfig validation --------------------------------------------------


def test_default_weights_sum_to_one() -> None:
    assert sum(FusionConfig().agent_weights.values()) == pytest.approx(1.0)


def test_config_rejects_weights_not_summing_to_one() -> None:
    with pytest.raises(ValueError, match="must sum to 1.0"):
        FusionConfig(agent_weights={"gas_risk": 0.5, "permit_intelligence": 0.6})


# --- Hand-computed multi-signal cases (Master Plan's own testing ask) --------


def test_one_elevated_signal() -> None:
    # base = .4*50 + .3*30 + .2*20 + .1*10 = 20+9+4+1 = 34.0
    # n=1 (only gas_risk >= 40) -> multiplier = 1.0 -> compound = 34.0
    results = _results(50.0, 30.0, 20.0, 10.0)
    contributions = calculate_agent_contributions(results, CONFIG)
    base = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(results, CONFIG)
    assert base == pytest.approx(34.0)
    assert multiplier == pytest.approx(1.0)
    assert calculate_compound_risk(base, multiplier) == pytest.approx(34.0)


def test_two_elevated_signals() -> None:
    # base = .4*50 + .3*45 + .2*20 + .1*10 = 20+13.5+4+1 = 38.5
    # n=2 (gas_risk, permit_intelligence) -> multiplier = 1 + 0.4*1 = 1.4
    # compound = 38.5 * 1.4 = 53.9
    results = _results(50.0, 45.0, 20.0, 10.0)
    contributions = calculate_agent_contributions(results, CONFIG)
    base = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(results, CONFIG)
    assert base == pytest.approx(38.5)
    assert multiplier == pytest.approx(1.4)
    assert calculate_compound_risk(base, multiplier) == pytest.approx(53.9)


def test_three_elevated_signals() -> None:
    # base = .4*50 + .3*45 + .2*45 + .1*10 = 20+13.5+9+1 = 43.5
    # n=3 -> multiplier = 1 + 0.4*2 = 1.8
    # compound = 43.5 * 1.8 = 78.3
    results = _results(50.0, 45.0, 45.0, 10.0)
    contributions = calculate_agent_contributions(results, CONFIG)
    base = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(results, CONFIG)
    assert base == pytest.approx(43.5)
    assert multiplier == pytest.approx(1.8)
    assert calculate_compound_risk(base, multiplier) == pytest.approx(78.3)


def test_four_elevated_signals_triggers_the_cap() -> None:
    # base = .4*50 + .3*45 + .2*45 + .1*45 = 20+13.5+9+4.5 = 47.0
    # n=4 -> multiplier = 1 + 0.4*3 = 2.2
    # raw compound = 47.0 * 2.2 = 103.4 -> capped to 100.0
    results = _results(50.0, 45.0, 45.0, 45.0)
    contributions = calculate_agent_contributions(results, CONFIG)
    base = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(results, CONFIG)
    assert base == pytest.approx(47.0)
    assert multiplier == pytest.approx(2.2)
    assert base * multiplier == pytest.approx(103.4)
    assert calculate_compound_risk(base, multiplier) == 100.0


# --- Invariants ---------------------------------------------------------------


def test_invariant_kappa_zero_means_compound_equals_weighted_sum_exactly() -> None:
    """M5B clarification 6."""
    zero_kappa_config = FusionConfig(interaction_bonus_kappa=0.0)
    results = _results(90.0, 90.0, 90.0, 90.0)  # all elevated, n=4
    contributions = calculate_agent_contributions(results, zero_kappa_config)
    base = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(results, zero_kappa_config)
    assert multiplier == 1.0
    assert calculate_compound_risk(base, multiplier) == pytest.approx(base)


def test_invariant_bounded_risk() -> None:
    for gas, permit, worker, equipment in [
        (0, 0, 0, 0),
        (100, 100, 100, 100),
        (50, 30, 20, 10),
        (100, 0, 0, 0),
    ]:
        results = _results(gas, permit, worker, equipment)
        contributions = calculate_agent_contributions(results, CONFIG)
        base = calculate_weighted_base_score(contributions)
        multiplier = calculate_interaction_multiplier(results, CONFIG)
        risk = calculate_compound_risk(base, multiplier)
        assert 0.0 <= risk <= 100.0


def test_invariant_confidence_bounded_and_is_the_minimum() -> None:
    results = _results(10.0, 10.0, 10.0, 10.0)
    results["gas_risk"] = _result(10.0, confidence=0.9)
    results["permit_intelligence"] = _result(10.0, confidence=0.95)
    results["worker_exposure"] = _result(10.0, confidence=0.99)
    results["equipment_status"] = _result(10.0, confidence=0.5)

    confidence = calculate_compound_confidence(results, CONFIG)
    assert confidence == 0.5
    assert 0.0 <= confidence <= 1.0


def test_invariant_increasing_one_agent_risk_never_decreases_compound_risk() -> None:
    low = _results(20.0, 20.0, 20.0, 20.0)
    high = _results(80.0, 20.0, 20.0, 20.0)

    def compound(results: dict[str, AgentResult]) -> float:
        contributions = calculate_agent_contributions(results, CONFIG)
        base = calculate_weighted_base_score(contributions)
        multiplier = calculate_interaction_multiplier(results, CONFIG)
        return calculate_compound_risk(base, multiplier)

    assert compound(high) >= compound(low)


# --- Failure strategy: missing agent is an integration failure ---------------


def test_missing_agent_result_raises() -> None:
    incomplete_results = {
        "gas_risk": _result(50.0),
        "permit_intelligence": _result(30.0),
        "worker_exposure": _result(20.0),
        # equipment_status missing
    }
    with pytest.raises(KeyError):
        calculate_agent_contributions(incomplete_results, CONFIG)


# --- fuse() (composition) and explainability ----------------------------------


def test_fuse_produces_agent_contributions_with_correct_math() -> None:
    results = _results(50.0, 30.0, 20.0, 10.0)
    result = fuse(ZONE_ID, NOW, results, CONFIG)

    by_name = {c.agent_name: c for c in result.agent_contributions}
    assert by_name["gas_risk"].raw_risk == 50.0
    assert by_name["gas_risk"].weight == 0.4
    assert by_name["gas_risk"].weighted_contribution == pytest.approx(20.0)
    assert result.compound_risk_score == pytest.approx(34.0)
    assert result.rules_fired == ["weighted_sum_fusion"]


def test_fuse_flags_interaction_bonus_when_multiple_signals_elevated() -> None:
    results = _results(50.0, 45.0, 20.0, 10.0)
    result = fuse(ZONE_ID, NOW, results, CONFIG)
    assert "interaction_bonus_applied" in result.rules_fired
    assert result.interaction_bonus_applied == pytest.approx(1.4)


def test_fuse_is_deterministic() -> None:
    results = _results(50.0, 45.0, 20.0, 10.0)
    first = fuse(ZONE_ID, NOW, results, CONFIG)
    second = fuse(ZONE_ID, NOW, results, CONFIG)
    assert first == second
