"""Tiering (Hysteresis) Engine tests.

Every sequence below is independently hand-traced against the state
machine's rules (shown in comments), per the project's standing
"validate with independently hand-computed sequences" discipline -
not derived by running the code first.
"""

import uuid
from datetime import UTC, datetime

from src.domain.orchestrator.risk_formula import FusionResult
from src.domain.orchestrator.tiering import TieringConfig, TierState, determine_raw_band, transition

ZONE_ID = uuid.uuid4()
NOW = datetime(2026, 7, 1, 8, 0, 0, tzinfo=UTC)
CONFIG = TieringConfig()


def _fusion(score: float) -> FusionResult:
    return FusionResult(
        zone_id=ZONE_ID,
        sim_time=NOW,
        compound_risk_score=score,
        confidence=1.0,
        agent_contributions=[],
        interaction_bonus_applied=1.0,
        rules_fired=["weighted_sum_fusion"],
    )


# --- determine_raw_band -------------------------------------------------------


def test_raw_band_boundaries() -> None:
    assert determine_raw_band(39.9, CONFIG) == "normal"
    assert determine_raw_band(40.0, CONFIG) == "watch"
    assert determine_raw_band(64.9, CONFIG) == "watch"
    assert determine_raw_band(65.0, CONFIG) == "elevated"
    assert determine_raw_band(84.9, CONFIG) == "elevated"
    assert determine_raw_band(85.0, CONFIG) == "critical"


# --- Escalation with dwell -----------------------------------------------------


def test_escalation_does_not_commit_before_dwell_ticks() -> None:
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)  # tick 1: watch candidate, ticks=1
    assert state.current_tier == "normal"  # not yet committed
    assert state.pending_tier == "watch"
    assert state.pending_ticks == 1


def test_escalation_commits_at_exactly_dwell_ticks() -> None:
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)  # tick 1
    state = transition(state, _fusion(50.0), CONFIG)  # tick 2 -> commit
    assert state.current_tier == "watch"
    assert state.entry_threshold == CONFIG.watch_threshold
    assert state.pending_tier is None
    assert state.pending_ticks == 0


def test_interrupted_escalation_resets_progress() -> None:
    """One tick of watch-candidate, then a tick back in the normal
    band, must reset the count - it never reaches dwell_ticks."""
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)  # watch candidate, ticks=1
    state = transition(state, _fusion(10.0), CONFIG)  # back to normal band -> reset
    assert state.current_tier == "normal"
    assert state.pending_tier is None
    assert state.pending_ticks == 0

    # Even after this reset, a fresh two-tick sequence still commits normally.
    state = transition(state, _fusion(50.0), CONFIG)
    state = transition(state, _fusion(50.0), CONFIG)
    assert state.current_tier == "watch"


def test_direct_multi_tier_escalation_jump() -> None:
    """From normal, a score straight into CRITICAL range is its own
    candidate - no requirement to pass through watch/elevated first."""
    state = TierState.initial()
    state = transition(state, _fusion(90.0), CONFIG)
    state = transition(state, _fusion(90.0), CONFIG)
    assert state.current_tier == "critical"
    assert state.entry_threshold == CONFIG.critical_threshold


# --- Hysteresis: de-escalation requires the margin, not just the up-threshold -


def test_score_within_margin_does_not_de_escalate() -> None:
    # Reach watch (entry_threshold=40) first.
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)
    state = transition(state, _fusion(50.0), CONFIG)
    assert state.current_tier == "watch"

    # 35 is below the watch up-threshold (40) but only 5 points below
    # entry_threshold - the margin requires at least 10.
    state = transition(state, _fusion(35.0), CONFIG)
    assert state.current_tier == "watch"
    assert state.pending_tier is None  # not even a candidate yet


def test_score_past_margin_de_escalates_after_dwell() -> None:
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)
    state = transition(state, _fusion(50.0), CONFIG)
    assert state.current_tier == "watch"  # entry_threshold = 40

    # 25 is 15 points below entry_threshold (40) - past the 10-point margin.
    state = transition(state, _fusion(25.0), CONFIG)  # candidate, ticks=1
    assert state.current_tier == "watch"
    state = transition(state, _fusion(25.0), CONFIG)  # ticks=2 -> commit
    assert state.current_tier == "normal"
    assert state.entry_threshold == 0.0


# --- Convergence invariant (no oscillation) -----------------------------------


def test_invariant_constant_score_converges_and_stays_stable() -> None:
    cases = [(10.0, "normal"), (50.0, "watch"), (70.0, "elevated"), (90.0, "critical")]
    for score, expected_tier in cases:
        state = TierState.initial()
        seen_states = []
        for _ in range(10):
            state = transition(state, _fusion(score), CONFIG)
            seen_states.append(state)

        assert state.current_tier == expected_tier
        # Once stable, further identical calls must be a no-op:
        # the last few states must be exactly equal, not just
        # equal in current_tier.
        assert seen_states[-1] == seen_states[-2] == seen_states[-3]


def test_invariant_stable_state_is_a_true_fixed_point() -> None:
    """Applying transition() to an already-stable state with the same
    score must return an identical TierState, not just an
    equivalent-looking one."""
    state = TierState.initial()
    state = transition(state, _fusion(50.0), CONFIG)
    state = transition(state, _fusion(50.0), CONFIG)
    assert state.current_tier == "watch"

    next_state = transition(state, _fusion(50.0), CONFIG)
    assert next_state == state
