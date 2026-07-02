"""Justification Builder tests.

Every construction below is independently hand-assembled against the
frozen ``risk_assessments.justification`` shape (Master Plan A.4), per
this project's standing "validate with independently hand-computed
values" discipline - not derived from the code under test.
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.base import AgentResult, Justification
from src.domain.orchestrator.justification import (
    RiskAssessmentJustification,
    build_risk_assessment_justification,
    determine_tier_transition_rule,
)
from src.domain.orchestrator.risk_formula import AgentContribution, FusionResult

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


def _agent_result(name: str, risk: float, confidence: float, rules: list[str]) -> AgentResult:
    return AgentResult(
        agent_name=name,
        risk=risk,
        confidence=confidence,
        justification=Justification(summary=f"{name} summary", rules_fired=rules),
        computed_at=NOW,
    )


def _fusion_result(
    contributions: list[AgentContribution],
    interaction_bonus_applied: float = 1.0,
    rules_fired: list[str] | None = None,
) -> FusionResult:
    return FusionResult(
        zone_id=ZONE_ID,
        sim_time=NOW,
        compound_risk_score=50.0,
        confidence=0.9,
        agent_contributions=contributions,
        interaction_bonus_applied=interaction_bonus_applied,
        rules_fired=rules_fired if rules_fired is not None else ["weighted_sum_fusion"],
    )


# --- Full construction against the frozen schema -------------------------------


def test_full_assembly_matches_frozen_schema_fields() -> None:
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 60.0, 0.9, ["saturating_threshold_function"]),
        "worker_exposure": _agent_result(
            "worker_exposure", 30.0, 0.8, ["exposure_weighted_headcount"]
        ),
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution(
                agent_name="gas_risk",
                raw_risk=60.0,
                weight=0.4,
                weighted_contribution=24.0,
                confidence=0.9,
            ),
            AgentContribution(
                agent_name="worker_exposure",
                raw_risk=30.0,
                weight=0.2,
                weighted_contribution=6.0,
                confidence=0.8,
            ),
        ],
        interaction_bonus_applied=1.0,
        rules_fired=["weighted_sum_fusion"],
    )

    result = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="normal", tier_after="watch"
    )

    assert isinstance(result, RiskAssessmentJustification)
    assert result.schema_version == 1
    assert result.rules_fired == [
        "saturating_threshold_function",
        "exposure_weighted_headcount",
        "weighted_sum_fusion",
        "tier_escalated",
    ]
    assert result.agent_contributions == {
        "gas_risk": {"risk": 60.0, "confidence": 0.9},
        "worker_exposure": {"risk": 30.0, "confidence": 0.8},
    }
    assert result.interaction_bonus_applied == 1.0
    assert result.tier_before == "normal"
    assert result.tier_after == "watch"


# --- rules_fired aggregation and ordering --------------------------------------


def test_rules_fired_preserves_fusion_agent_order_then_fusion_then_tier_rule() -> None:
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 60.0, 0.9, ["rule_a"]),
        "permit_intelligence": _agent_result("permit_intelligence", 20.0, 1.0, ["rule_b"]),
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution("permit_intelligence", 20.0, 0.3, 6.0, 1.0),
            AgentContribution("gas_risk", 60.0, 0.4, 24.0, 0.9),
        ],
        rules_fired=["weighted_sum_fusion"],
    )

    result = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="watch", tier_after="watch"
    )

    # Order follows fusion_result.agent_contributions (permit first,
    # then gas_risk), not agent_results' own dict order.
    assert result.rules_fired == ["rule_b", "rule_a", "weighted_sum_fusion", "tier_stable"]


def test_rules_fired_deduplicates_preserving_first_occurrence() -> None:
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 60.0, 0.9, ["shared_rule", "gas_only_rule"]),
        "worker_exposure": _agent_result("worker_exposure", 30.0, 0.8, ["shared_rule"]),
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution("gas_risk", 60.0, 0.4, 24.0, 0.9),
            AgentContribution("worker_exposure", 30.0, 0.2, 6.0, 0.8),
        ],
        rules_fired=["shared_rule"],
    )

    result = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="watch", tier_after="watch"
    )

    assert result.rules_fired == [
        "shared_rule",
        "gas_only_rule",
        "tier_stable",
    ]


# --- Tier-transition rule derivation --------------------------------------------


def test_tier_transition_rule_escalated() -> None:
    assert determine_tier_transition_rule("normal", "watch") == "tier_escalated"
    assert determine_tier_transition_rule("watch", "critical") == "tier_escalated"


def test_tier_transition_rule_de_escalated() -> None:
    assert determine_tier_transition_rule("critical", "elevated") == "tier_de_escalated"
    assert determine_tier_transition_rule("watch", "normal") == "tier_de_escalated"


def test_tier_transition_rule_stable() -> None:
    assert determine_tier_transition_rule("elevated", "elevated") == "tier_stable"
    assert determine_tier_transition_rule("normal", "normal") == "tier_stable"


# --- Caller-inconsistency failure strategy --------------------------------------


def test_missing_agent_result_raises() -> None:
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 60.0, 0.9, ["rule_a"]),
        # worker_exposure missing, even though Fusion already used it.
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution("gas_risk", 60.0, 0.4, 24.0, 0.9),
            AgentContribution("worker_exposure", 30.0, 0.2, 6.0, 0.8),
        ],
    )

    with pytest.raises(KeyError):
        build_risk_assessment_justification(
            agent_results, fusion_result, tier_before="watch", tier_after="watch"
        )


# --- agent_contributions sourced exclusively from FusionResult ------------------


def test_agent_contributions_sourced_from_fusion_not_agent_results() -> None:
    """A deliberately divergent AgentResult.risk must be ignored -
    the output must reflect FusionResult's own numbers, proving this
    is not silently recomputed from agent_results (clarification 2)."""
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 999.0, 0.1, ["rule_a"]),
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution("gas_risk", 60.0, 0.4, 24.0, 0.9),
        ],
    )

    result = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="watch", tier_after="watch"
    )

    assert result.agent_contributions == {"gas_risk": {"risk": 60.0, "confidence": 0.9}}


# --- Determinism invariant -------------------------------------------------------


def test_determinism_identical_inputs_produce_identical_output() -> None:
    agent_results = {
        "gas_risk": _agent_result("gas_risk", 60.0, 0.9, ["rule_a"]),
        "worker_exposure": _agent_result("worker_exposure", 30.0, 0.8, ["rule_b"]),
    }
    fusion_result = _fusion_result(
        contributions=[
            AgentContribution("gas_risk", 60.0, 0.4, 24.0, 0.9),
            AgentContribution("worker_exposure", 30.0, 0.2, 6.0, 0.8),
        ],
    )

    first = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="normal", tier_after="watch"
    )
    second = build_risk_assessment_justification(
        agent_results, fusion_result, tier_before="normal", tier_after="watch"
    )

    assert first == second
