"""Tiering / Hysteresis Engine - Technical Review Section 5.6.

Converts a FusionResult's compound risk score into a stable per-zone
tier (WATCH/ELEVATED/CRITICAL, plus an implicit "normal" band below
WATCH) using asymmetric hysteresis and dwell-time, so a score
oscillating near a threshold doesn't chatter between tiers every
tick.

A pure deterministic state transition:
``(previous TierState, FusionResult, TieringConfig) -> new TierState``.
Never recomputes risk (that's Fusion's job, upstream and unchanged),
never touches a repository, never executes an agent, never schedules
anything. This module is responsible only for stable operational
state - a future alerting module consumes a tier *change*, it does
not reimplement hysteresis itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.domain.orchestrator.risk_formula import FusionResult

TIER_ORDER = ("normal", "watch", "elevated", "critical")
"""Total order, least to most severe. "normal" is this module's own
naming for the implicit band below WATCH - Technical Review 5.6 names
only the three elevated tiers."""


@dataclass(frozen=True)
class TieringConfig:
    """Immutable, tunable parameters - independent of every other
    module's configuration, per this project's standing discipline.
    """

    algorithm_name: str = "hysteresis_tiering"
    algorithm_version: int = 1
    # Cited: Technical Review 5.6 - "WATCH (>=40), ELEVATED (>=65),
    # CRITICAL (>=85)". Same values used independently elsewhere in
    # this project (Gas Risk's elevated_floor, Fusion's own copy).
    watch_threshold: float = 40.0
    elevated_threshold: float = 65.0
    critical_threshold: float = 85.0
    # Cited: "a zone must drop at least 10 points below its entry
    # threshold before de-escalating."
    de_escalation_margin: float = 10.0
    # Cited example, not a hard number: "a minimum dwell time (e.g.,
    # 2 consecutive ticks)."
    dwell_ticks: int = 2


@dataclass(frozen=True)
class TierState:
    """Per-zone state that persists across ticks - the only place in
    the Orchestrator besides AgentCache (M5A) where cross-tick memory
    legitimately lives, since Fusion and the agents are stateless.

    ``entry_threshold`` is the threshold value associated with
    ``current_tier`` itself (not the raw score at the moment it was
    entered) - what the 10-point de-escalation margin is measured
    against.
    """

    current_tier: str
    entry_threshold: float
    pending_tier: str | None = None
    pending_ticks: int = 0

    @staticmethod
    def initial() -> TierState:
        """The defined starting state for a zone with no prior tick -
        an ordinary case, not a degraded one."""
        return TierState(current_tier="normal", entry_threshold=0.0)


def _tier_rank(tier: str) -> int:
    return TIER_ORDER.index(tier)


def _threshold_for_tier(tier: str, config: TieringConfig) -> float:
    return {
        "normal": 0.0,
        "watch": config.watch_threshold,
        "elevated": config.elevated_threshold,
        "critical": config.critical_threshold,
    }[tier]


def determine_raw_band(compound_risk_score: float, config: TieringConfig) -> str:
    """Which tier the raw score falls into, with no hysteresis or
    dwell applied - the "if this were symmetric" band."""
    if compound_risk_score >= config.critical_threshold:
        return "critical"
    if compound_risk_score >= config.elevated_threshold:
        return "elevated"
    if compound_risk_score >= config.watch_threshold:
        return "watch"
    return "normal"


def transition(
    previous: TierState,
    fusion_result: FusionResult,
    config: TieringConfig,
) -> TierState:
    """One pure state transition. Escalation is symmetric (the raw
    band immediately becomes the candidate); de-escalation requires
    the score to have dropped at least ``de_escalation_margin`` below
    ``previous.entry_threshold`` before it becomes a candidate at all
    (M5C clarification 1: dwell gates the tier itself, so a candidate
    - escalation or de-escalation - only commits after
    ``dwell_ticks`` consecutive observations of the *same* candidate).
    """
    score = fusion_result.compound_risk_score
    raw_band = determine_raw_band(score, config)
    current_rank = _tier_rank(previous.current_tier)
    raw_rank = _tier_rank(raw_band)

    de_escalation_cutoff = previous.entry_threshold - config.de_escalation_margin
    candidate: str | None
    if raw_rank > current_rank:
        candidate = raw_band
    elif raw_rank < current_rank and score <= de_escalation_cutoff:
        candidate = raw_band
    else:
        candidate = None

    if candidate is None:
        return TierState(
            current_tier=previous.current_tier,
            entry_threshold=previous.entry_threshold,
            pending_tier=None,
            pending_ticks=0,
        )

    ticks = previous.pending_ticks + 1 if previous.pending_tier == candidate else 1

    if ticks >= config.dwell_ticks:
        return TierState(
            current_tier=candidate,
            entry_threshold=_threshold_for_tier(candidate, config),
            pending_tier=None,
            pending_ticks=0,
        )

    return TierState(
        current_tier=previous.current_tier,
        entry_threshold=previous.entry_threshold,
        pending_tier=candidate,
        pending_ticks=ticks,
    )
