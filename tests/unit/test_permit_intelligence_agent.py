"""Permit Intelligence Agent (M4B) tests.

Includes the escalation-only invariant and the finding-severity
monotonicity invariant M4B clarifications 5 and 7 ask for, plus a
real (non-mocked) GasRiskAgent integration test per clarification 8.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from src.domain.agents.base import AgentInput, AgentResult, Justification
from src.domain.agents.gas_risk import GasReading, GasRiskAgent
from src.domain.agents.permit_intelligence import (
    AdjacentZoneStatus,
    BaselineDeltaAssessment,
    PermitBaselineSnapshot,
    PermitIntelligenceAgent,
    PermitReasoningConfig,
    PermitRecord,
    SimopsConflict,
    calculate_confidence,
    determine_recommended_status,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = PermitReasoningConfig()


def _gas_risk_result(risk: float, confidence: float = 1.0) -> AgentResult:
    return AgentResult(
        agent_name="gas_risk",
        risk=risk,
        confidence=confidence,
        justification=Justification(summary="test"),
        computed_at=NOW,
    )


def _permit(
    status: str = "active", baseline_gas_risk: float = 30.0, permit_type: str = "hot_work"
) -> PermitRecord:
    return PermitRecord(
        identifier="permit-1",
        permit_type=permit_type,
        zone_id=ZONE_ID,
        status=status,  # type: ignore[arg-type]
        baseline=PermitBaselineSnapshot(
            schema_version=1,
            algorithm_version=1,
            gas_risk_at_issuance=baseline_gas_risk,
            confidence_at_issuance=1.0,
            captured_at=NOW,
        ),
    )


def _make_input(
    permits: list[PermitRecord],
    gas_risk_score: float = 30.0,
    gas_risk_confidence: float = 1.0,
    adjacent_zones: list[AdjacentZoneStatus] | None = None,
    feed_stale: bool = False,
) -> AgentInput:
    context: dict[str, object] = {"permits": permits, "permit_feed_stale": feed_stale}
    if adjacent_zones is not None:
        context["adjacent_zones"] = adjacent_zones
    return AgentInput(
        zone_id=ZONE_ID,
        sim_time=NOW,
        tick_id=1,
        context=context,
        upstream_results={"gas_risk": _gas_risk_result(gas_risk_score, gas_risk_confidence)},
    )


# --- determine_recommended_status (escalation-only + severity mapping) ------


def test_no_findings_keeps_active() -> None:

    assessment = BaselineDeltaAssessment(30.0, 35.0, 5.0, 20.0, exceeded=False)
    result = determine_recommended_status("active", assessment, [], CONFIG)
    assert result == "active"


def test_baseline_breach_escalates_to_flagged() -> None:

    assessment = BaselineDeltaAssessment(30.0, 60.0, 30.0, 20.0, exceeded=True)
    result = determine_recommended_status("active", assessment, [], CONFIG)
    assert result == "flagged"


def test_simops_conflict_escalates_to_suspend_recommended() -> None:

    assessment = BaselineDeltaAssessment(30.0, 35.0, 5.0, 20.0, exceeded=False)
    conflict = SimopsConflict(uuid.uuid4(), "hot_work", "confined_space", 70.0)
    result = determine_recommended_status("active", assessment, [conflict], CONFIG)
    assert result == "suspend_recommended"


def test_escalation_only_never_de_escalates() -> None:
    """M4B clarification 5: a permit already at suspend_recommended
    stays there even when this tick's findings are clean."""

    assessment = BaselineDeltaAssessment(30.0, 32.0, 2.0, 20.0, exceeded=False)
    result = determine_recommended_status("suspend_recommended", assessment, [], CONFIG)
    assert result == "suspend_recommended"


def test_stale_feed_escalates_active_to_flagged() -> None:
    result = determine_recommended_status("active", None, [], CONFIG)
    assert result == "flagged"


def test_stale_feed_never_de_escalates_suspend_recommended() -> None:
    result = determine_recommended_status("suspend_recommended", None, [], CONFIG)
    assert result == "suspend_recommended"


def test_invariant_increasing_finding_severity_never_de_escalates_recommendation() -> None:
    """M4B clarification 7: none -> baseline-only -> simops-only ->
    both, in increasing severity, never produces a less severe
    recommendation than the previous case."""

    order = CONFIG.status_severity_order
    no_findings = BaselineDeltaAssessment(30.0, 35.0, 5.0, 20.0, exceeded=False)
    baseline_only = BaselineDeltaAssessment(30.0, 60.0, 30.0, 20.0, exceeded=True)
    conflict = SimopsConflict(uuid.uuid4(), "hot_work", "confined_space", 70.0)

    cases = [
        determine_recommended_status("active", no_findings, [], CONFIG),
        determine_recommended_status("active", baseline_only, [], CONFIG),
        determine_recommended_status("active", baseline_only, [conflict], CONFIG),
    ]
    ranks = [order.index(status) for status in cases]
    assert ranks == sorted(ranks)


# --- calculate_confidence -----------------------------------------------------


def test_confidence_uses_gas_risk_confidence_when_adjacent_data_present() -> None:
    assert calculate_confidence(0.5, adjacent_zones_provided=True, config=CONFIG) == 0.5


def test_confidence_drops_when_adjacent_data_missing() -> None:
    result = calculate_confidence(0.9, adjacent_zones_provided=False, config=CONFIG)
    assert result == CONFIG.missing_adjacent_data_confidence


# --- PermitIntelligenceAgent (full evaluate()) --------------------------------


async def test_evaluate_no_open_permits() -> None:
    agent = PermitIntelligenceAgent()
    result = await agent.evaluate(_make_input(permits=[]))
    assert result.risk == 0.0
    assert result.justification.rules_fired == ["no_open_permits"]


async def test_evaluate_closed_permits_are_excluded() -> None:
    agent = PermitIntelligenceAgent()
    result = await agent.evaluate(
        _make_input(permits=[_permit(status="closed")], gas_risk_score=90.0)
    )
    assert result.justification.evidence["decisions"] == []


async def test_evaluate_escalates_on_baseline_breach() -> None:
    agent = PermitIntelligenceAgent()
    result = await agent.evaluate(
        _make_input(
            permits=[_permit(status="active", baseline_gas_risk=20.0)],
            gas_risk_score=50.0,  # delta = 30 > threshold 20
            adjacent_zones=[],
        )
    )
    decisions = result.justification.evidence["decisions"]
    assert decisions[0]["recommended_status"] == "flagged"
    assert result.risk == pytest.approx(CONFIG.risk_by_status["flagged"])


async def test_evaluate_fail_open_never() -> None:
    agent = PermitIntelligenceAgent()
    result = await agent.evaluate(_make_input(permits=[_permit(status="active")], feed_stale=True))
    decisions = result.justification.evidence["decisions"]
    assert decisions[0]["recommended_status"] == "flagged"
    assert result.justification.rules_fired == ["fail_open_never"]


async def test_evaluate_raises_when_gas_risk_upstream_result_missing() -> None:
    agent = PermitIntelligenceAgent()
    bad_input = AgentInput(zone_id=ZONE_ID, sim_time=NOW, tick_id=1, upstream_results={})
    with pytest.raises(KeyError):
        await agent.evaluate(bad_input)


async def test_evaluate_is_deterministic() -> None:
    agent = PermitIntelligenceAgent()
    input_ = _make_input(permits=[_permit()], gas_risk_score=50.0, adjacent_zones=[])
    first = await agent.evaluate(input_)
    second = await agent.evaluate(input_)
    assert first == second


async def test_evaluate_with_real_gas_risk_agent_end_to_end() -> None:
    """M4B clarification 8: a real GasRiskAgent evaluation, not a mock,
    feeding Permit Intelligence's upstream_results - proves the actual
    Tier-0 -> Tier-1 data flow works, not just a hand-built AgentResult."""
    gas_risk_agent = GasRiskAgent()
    gas_risk_input = AgentInput(
        zone_id=ZONE_ID,
        sim_time=NOW,
        tick_id=1,
        context={
            "readings": [
                GasReading(timestamp=NOW - timedelta(minutes=5), value=8.0),
                GasReading(timestamp=NOW, value=9.0),
            ],
            "alarm_threshold": 10.0,
            "last_calibrated_at": NOW,
        },
    )
    gas_risk_result = await gas_risk_agent.evaluate(gas_risk_input)

    permit_agent = PermitIntelligenceAgent()
    permit_input = AgentInput(
        zone_id=ZONE_ID,
        sim_time=NOW,
        tick_id=1,
        context={
            "permits": [_permit(status="active", baseline_gas_risk=10.0)],
            "permit_feed_stale": False,
            "adjacent_zones": [],
        },
        upstream_results={"gas_risk": gas_risk_result},
    )
    permit_result = await permit_agent.evaluate(permit_input)

    assert permit_result.justification.evidence["gas_risk_confidence_used"] == pytest.approx(
        gas_risk_result.confidence
    )
    decisions = permit_result.justification.evidence["decisions"]
    assert decisions[0]["baseline_delta"] == pytest.approx(gas_risk_result.risk - 10.0)
