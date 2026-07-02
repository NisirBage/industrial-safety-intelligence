"""Fusion Engine (M5B) - Technical Review Section 5.2/5.3.

The weighted-sum-plus-interaction-bonus formula that combines the
four agents' AgentResults (as already produced by the scheduler,
M5A) into one compound risk score and confidence per zone, per tick.

Consumes scheduler outputs only - a plain ``Mapping[str, AgentResult]``
- and never executes an agent, never touches a repository, and never
performs scheduling or tiering (M5B clarification 8). Deterministic
and side-effect free: every function here is a pure function of its
arguments.
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from src.domain.agents.base import AgentResult


@dataclass(frozen=True)
class FusionConfig:
    """Immutable, tunable parameters - independent of every agent's
    own configuration, per this project's standing discipline.

    Validated at construction: ``agent_weights`` must sum to 1.0
    (M5B clarification 3), matching Technical Review 5.2's own
    constraint ("Sigma w_i = 1").
    """

    algorithm_name: str = "compound_risk_fusion"
    algorithm_version: int = 1
    # Ordered to match each agent's own documented priority (Technical
    # Review 4.1-4.4: Gas Risk "Highest", Permit Intelligence
    # "Second-highest", Worker Exposure "Third", Equipment Status
    # "Fourth... a multiplier-eligible term rather than a large
    # standalone weight") - proposed values, not cited numbers, but
    # not an arbitrary ordering either.
    agent_weights: dict[str, float] = field(
        default_factory=lambda: {
            "gas_risk": 0.4,
            "permit_intelligence": 0.3,
            "worker_exposure": 0.2,
            "equipment_status": 0.1,
        }
    )
    # Cited range: Technical Review 5.3 "tuned around 0.35-0.5" - this
    # default is the range's midpoint, not itself a cited exact value.
    interaction_bonus_kappa: float = 0.4
    # Cited: Technical Review 5.3's own interaction-bonus example uses
    # "elevated_floor (e.g., 40)" - reused independently here, not
    # imported from any agent's own config.
    elevated_floor: float = 40.0

    def __post_init__(self) -> None:
        total = sum(self.agent_weights.values())
        if not math.isclose(total, 1.0, rel_tol=1e-9, abs_tol=1e-9):
            raise ValueError(f"agent_weights must sum to 1.0, got {total}")


@dataclass(frozen=True)
class AgentContribution:
    """One agent's raw risk, its configured weight, and the resulting
    weighted contribution to the base score - explainability evidence
    a human can use to re-derive R_base by hand (M5B clarification 5).
    """

    agent_name: str
    raw_risk: float
    weight: float
    weighted_contribution: float
    confidence: float


@dataclass(frozen=True)
class FusionResult:
    """Fusion's domain-level output - not the persistence-layer
    ``RiskAssessment`` model (M5B clarification 1). Missing
    ``tier``/``tier_before``/``tier_after`` deliberately: those
    require the hysteresis state machine, a separate, not-yet-built
    module. Whatever builds the full justification object later
    extends this, the same way M4B extended M4A's representations.
    """

    zone_id: uuid.UUID
    sim_time: datetime
    compound_risk_score: float
    confidence: float
    agent_contributions: list[AgentContribution]
    interaction_bonus_applied: float
    rules_fired: list[str]


def calculate_agent_contributions(
    agent_results: Mapping[str, AgentResult],
    config: FusionConfig,
) -> list[AgentContribution]:
    """Raises KeyError if a configured agent's result is missing -
    a missing agent is an integration failure, never fabricated
    (M5B clarification 7). Iterating over ``config.agent_weights``
    (not ``agent_results``) is what makes this check automatic: every
    weighted agent must have a real result, or this raises.
    """
    return [
        AgentContribution(
            agent_name=name,
            raw_risk=agent_results[name].risk,
            weight=weight,
            weighted_contribution=weight * agent_results[name].risk,
            confidence=agent_results[name].confidence,
        )
        for name, weight in config.agent_weights.items()
    ]


def calculate_weighted_base_score(contributions: list[AgentContribution]) -> float:
    """R_base = Sigma(w_i * r_i), Technical Review 5.2."""
    return sum(c.weighted_contribution for c in contributions)


def calculate_interaction_multiplier(
    agent_results: Mapping[str, AgentResult],
    config: FusionConfig,
) -> float:
    """1 + kappa * max(0, n-1), Technical Review 5.3, where n counts
    agents at or above the elevated floor. With kappa=0 this is
    always exactly 1.0, regardless of n (M5B clarification 6)."""
    n = sum(1 for name in config.agent_weights if agent_results[name].risk >= config.elevated_floor)
    return 1.0 + config.interaction_bonus_kappa * max(0, n - 1)


def calculate_compound_risk(base_score: float, multiplier: float) -> float:
    """R_compound = min(100, R_base * multiplier), Technical Review 5.3."""
    return min(100.0, base_score * multiplier)


def calculate_compound_confidence(
    agent_results: Mapping[str, AgentResult],
    config: FusionConfig,
) -> float:
    """Minimum across all four agents' confidences (M5B clarification
    4) - the same worst-factor-gates-the-whole-score discipline every
    agent already applies internally, now applied across agents."""
    return min(agent_results[name].confidence for name in config.agent_weights)


def fuse(
    zone_id: uuid.UUID,
    sim_time: datetime,
    agent_results: Mapping[str, AgentResult],
    config: FusionConfig,
) -> FusionResult:
    """Composes the pure functions above into one FusionResult."""
    contributions = calculate_agent_contributions(agent_results, config)
    base_score = calculate_weighted_base_score(contributions)
    multiplier = calculate_interaction_multiplier(agent_results, config)
    compound_risk = calculate_compound_risk(base_score, multiplier)
    confidence = calculate_compound_confidence(agent_results, config)

    rules_fired = ["weighted_sum_fusion"]
    if multiplier > 1.0:
        rules_fired.append("interaction_bonus_applied")

    return FusionResult(
        zone_id=zone_id,
        sim_time=sim_time,
        compound_risk_score=compound_risk,
        confidence=confidence,
        agent_contributions=contributions,
        interaction_bonus_applied=multiplier,
        rules_fired=rules_fired,
    )
