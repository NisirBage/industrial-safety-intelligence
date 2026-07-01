"""Framework-level tests for the shared Agent contract.

Proves the contract itself is soundly designed - there is no real
agent domain logic yet (that's M3B). Two structurally-unrelated test
doubles (neither subclasses the other) are used throughout so a
passing test can't be an accident of one implementation's quirks
(M3A clarification 9).
"""

import uuid
from datetime import UTC, datetime

import pytest

from src.domain.agents.base import (
    Agent,
    AgentInput,
    AgentMetadata,
    AgentResult,
    Justification,
)

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)


class AlwaysSafeAgent:
    """Always reports zero risk - proves the Protocol is satisfiable."""

    metadata = AgentMetadata(name="always_safe", description="Test double: reports zero risk.")

    async def evaluate(self, input: AgentInput) -> AgentResult:
        return AgentResult(
            agent_name=self.metadata.name,
            risk=0.0,
            confidence=1.0,
            justification=Justification(summary="No risk factors present."),
            computed_at=input.sim_time,
        )


class AlwaysCriticalAgent:
    """A second, unrelated implementation - not a subclass of AlwaysSafeAgent."""

    metadata = AgentMetadata(name="always_critical", description="Test double: reports max risk.")

    async def evaluate(self, input: AgentInput) -> AgentResult:
        return AgentResult(
            agent_name=self.metadata.name,
            risk=100.0,
            confidence=0.5,
            justification=Justification(
                summary="Forced critical for testing.",
                rules_fired=["test_rule"],
                evidence={"reason": "test double"},
            ),
            computed_at=input.sim_time,
        )


class RaisingAgent:
    """Simulates a genuine failure - proves the contract never swallows one."""

    metadata = AgentMetadata(name="raising", description="Test double: always raises.")

    async def evaluate(self, input: AgentInput) -> AgentResult:
        raise RuntimeError("simulated infrastructure failure")


def _make_input() -> AgentInput:
    return AgentInput(zone_id=ZONE_ID, sim_time=NOW, tick_id=1)


@pytest.mark.parametrize("agent_cls", [AlwaysSafeAgent, AlwaysCriticalAgent])
async def test_independent_implementations_satisfy_the_protocol(
    agent_cls: type[Agent],
) -> None:
    agent = agent_cls()
    assert isinstance(agent, Agent)
    result = await agent.evaluate(_make_input())
    assert 0.0 <= result.risk <= 100.0
    assert 0.0 <= result.confidence <= 1.0
    assert result.schema_version == 1


async def test_two_implementations_produce_independent_results() -> None:
    safe = await AlwaysSafeAgent().evaluate(_make_input())
    critical = await AlwaysCriticalAgent().evaluate(_make_input())
    assert safe.risk != critical.risk
    assert safe.agent_name != critical.agent_name


async def test_exceptions_propagate_and_are_not_swallowed() -> None:
    with pytest.raises(RuntimeError, match="simulated infrastructure failure"):
        await RaisingAgent().evaluate(_make_input())


def test_agent_input_defaults_are_empty_not_none() -> None:
    input_ = _make_input()
    assert input_.upstream_results == {}
    assert input_.context == {}


def test_upstream_results_can_carry_a_prior_agents_result() -> None:
    prior = AgentResult(
        agent_name="gas_risk",
        risk=42.0,
        confidence=0.9,
        justification=Justification(summary="test"),
        computed_at=NOW,
    )
    input_ = AgentInput(
        zone_id=ZONE_ID, sim_time=NOW, tick_id=1, upstream_results={"gas_risk": prior}
    )
    assert input_.upstream_results["gas_risk"].risk == 42.0


def test_justification_evidence_is_optional() -> None:
    minimal = Justification(summary="no rules fired")
    assert minimal.rules_fired == []
    assert minimal.evidence is None
