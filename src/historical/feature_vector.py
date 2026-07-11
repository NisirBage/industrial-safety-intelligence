"""M24 Part 3 (Feature Vector) - a deterministic, documented numeric
representation of one assessment tick, built entirely from fields the
frozen engine already computed and persisted. Nothing here recomputes
risk, tiers, or fusion; it only reads ``RiskAssessment.compound_risk_score``,
``.confidence``, ``.tier``, and the already-serialized ``.justification``
dict (the same snake_case shape ``src/services/risk_pipeline.py``
writes and ``src/services/replay.py`` already reads with plain
``.get()`` calls - this module follows that exact same reading style
rather than inventing a parser).

Why these 11 features, not the milestone brief's literal suggestion
list ("Gas tier, Pressure tier, Temperature tier, ..."): this platform
has exactly four agents (Gas Risk, Equipment Status, Worker Exposure,
Permit Intelligence) and no pressure or temperature sensor type at
all - inventing "pressure tier"/"temperature tier" features would mean
fabricating data this engine has never produced. The features below
are the real substitution: one feature per real agent's raw risk
contribution, plus the platform's own real compound score, confidence,
tier, interaction bonus, agent-count, and trend - every one traceable
to a field that already exists on a persisted row.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.infra.db.models.risk_assessment import RISK_TIERS, RiskAssessment

#: Ordinal encoding of the frozen Tiering Engine's own tier order -
#: not a new severity scale, just RISK_TIERS's existing sequence
#: turned into a number so it can enter a distance calculation.
_TIER_ORDINAL: dict[str, int] = {tier: index for index, tier in enumerate(RISK_TIERS)}

#: The four agent names `agent_contributions` is ever keyed by -
#: copied from `build_agent_contributions` (src/domain/orchestrator/
#: risk_formula.py), not redefined independently.
AGENT_NAMES: tuple[str, ...] = (
    "gas_risk",
    "equipment_status",
    "worker_exposure",
    "permit_intelligence",
)


@dataclass(frozen=True)
class FeatureVector:
    """One tick's deterministic feature representation.

    Every field below is documented with the exact persisted source it
    reads and why it exists in a similarity comparison.
    """

    #: Gas Risk agent's raw risk contribution (0-100). Exists because
    #: gas concentration is this platform's only direct sensor-driven
    #: hazard signal - the closest real analog to the brief's
    #: "Gas tier".
    gas_risk: float

    #: Equipment Status agent's raw risk contribution (0-100). Exists
    #: to capture common-cause-aware equipment degradation, the
    #: platform's only "equipment health" signal.
    equipment_risk: float

    #: Worker Exposure agent's raw risk contribution (0-100). Exists to
    #: capture headcount-weighted exposure - the brief's "Worker
    #: exposure" feature, unchanged in name and meaning.
    worker_risk: float

    #: Permit Intelligence agent's raw risk contribution (0-100).
    #: Exists to capture permit/work-authorization risk, the closest
    #: real analog to the brief's "Permit overlap".
    permit_risk: float

    #: Fusion's own compound score (0-100, `RiskAssessment.compound_risk_score`).
    #: Exists because two incidents with identical per-agent risk can
    #: still differ once Fusion's interaction bonus is applied - this
    #: feature is what actually matches on overall severity.
    compound_risk_score: float

    #: `RiskAssessment.confidence` (0-1), unmodified. Exists so a
    #: high-confidence critical tick is not matched equally against a
    #: low-confidence one of the same score.
    confidence: float

    #: Ordinal position of `RiskAssessment.tier` in the frozen
    #: `RISK_TIERS` sequence (0=normal .. 3=critical). Exists as the
    #: brief's "Operational status" feature - a category, not a new
    #: score, turned into a number only so distance math can use it.
    tier_ordinal: int

    #: `justification["interaction_bonus_applied"]` verbatim (1.0 means
    #: no bonus; >1.0 means Fusion detected concurrent elevated
    #: agents). Exists because SIMOPS-style compounding incidents are
    #: qualitatively different from single-cause ones even at the same
    #: compound score.
    interaction_bonus: float

    #: Count of agents (0-4) whose `agent_contributions[*]["risk"] > 0`
    #: this tick. Exists as the brief's "Triggered agents" feature,
    #: reduced to a magnitude for the distance metric - the actual
    #: agent names are kept separately (`triggered_agents` below) for
    #: the human-readable "matching/differing features" narrative.
    triggered_agent_count: int

    #: -1 (falling), 0 (flat/first tick), or +1 (rising) - compares
    #: this tick's `compound_risk_score` to the immediately preceding
    #: tick for the same zone (the same adjacency `replay.py` already
    #: establishes by returning zone timelines ascending by
    #: timestamp). Exists as the brief's "Trend direction" feature.
    trend: int

    #: Which agents actually fired a non-zero contribution this tick -
    #: not a distance-metric input, kept for the "matching/differing
    #: features" narrative (M24 Part 5) so a match can say "both
    #: incidents had Gas Risk and Permit Intelligence active" in plain
    #: language rather than only a numeric score.
    triggered_agents: frozenset[str] = field(default_factory=frozenset)

    def as_tuple(self) -> tuple[float, ...]:
        """The 9 numeric dimensions the similarity engine compares -
        `triggered_agents` is deliberately excluded (it's a set, not a
        scalar; its magnitude is already captured by
        `triggered_agent_count`)."""
        return (
            self.gas_risk,
            self.equipment_risk,
            self.worker_risk,
            self.permit_risk,
            self.compound_risk_score,
            self.confidence * 100,  # rescaled to 0-100 so it weighs comparably to the risk features
            self.tier_ordinal * (100 / (len(RISK_TIERS) - 1)),  # rescaled 0-100
            (self.interaction_bonus - 1.0) * 100,  # 0 when no bonus, grows with compounding
            self.triggered_agent_count * 25,  # rescaled 0-100 (0..4 agents)
        )


#: Names `as_tuple()` returns in order - used by the similarity engine
#: to align per-feature weights and by any UI wanting to label a
#: dimension. Kept next to `as_tuple` so the two can never drift.
FEATURE_NAMES: tuple[str, ...] = (
    "gas_risk",
    "equipment_risk",
    "worker_risk",
    "permit_risk",
    "compound_risk_score",
    "confidence",
    "tier_ordinal",
    "interaction_bonus",
    "triggered_agent_count",
)


def _agent_risk(agent_contributions: dict[str, object], agent_name: str) -> float:
    contribution = agent_contributions.get(agent_name)
    if not isinstance(contribution, dict):
        return 0.0
    risk = contribution.get("risk")
    return float(risk) if isinstance(risk, int | float) else 0.0


def build_feature_vector(
    assessment: RiskAssessment, previous: RiskAssessment | None
) -> FeatureVector:
    """Pure function: one persisted tick (+ the immediately preceding
    tick for the same zone, if any) -> one `FeatureVector`. Never
    queries anything itself - the caller (`knowledge_base.py`) supplies
    both rows from data it already fetched via `build_replay`.
    """
    justification = assessment.justification or {}
    agent_contributions = justification.get("agent_contributions")
    agent_contributions = agent_contributions if isinstance(agent_contributions, dict) else {}

    triggered = frozenset(
        name for name in AGENT_NAMES if _agent_risk(agent_contributions, name) > 0
    )

    interaction_bonus = justification.get("interaction_bonus_applied")
    interaction_bonus_value = (
        float(interaction_bonus) if isinstance(interaction_bonus, int | float) else 1.0
    )

    if previous is None:
        trend = 0
    elif assessment.compound_risk_score > previous.compound_risk_score:
        trend = 1
    elif assessment.compound_risk_score < previous.compound_risk_score:
        trend = -1
    else:
        trend = 0

    return FeatureVector(
        gas_risk=_agent_risk(agent_contributions, "gas_risk"),
        equipment_risk=_agent_risk(agent_contributions, "equipment_status"),
        worker_risk=_agent_risk(agent_contributions, "worker_exposure"),
        permit_risk=_agent_risk(agent_contributions, "permit_intelligence"),
        compound_risk_score=float(assessment.compound_risk_score),
        confidence=float(assessment.confidence),
        tier_ordinal=_TIER_ORDINAL.get(assessment.tier, 0),
        interaction_bonus=interaction_bonus_value,
        triggered_agent_count=len(triggered),
        trend=trend,
        triggered_agents=triggered,
    )
