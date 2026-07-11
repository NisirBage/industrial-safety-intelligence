"""M24 Part 4 (Similarity Engine) - deterministic distance over
`FeatureVector`s. No LLM, no embeddings, no neural network: every
number below is either a weight this file documents or a feature
`feature_vector.py` already documented.

Algorithm chosen: **weighted Euclidean distance**, converted to a
bounded 0-1 similarity score via ``1 / (1 + distance)``.

Why Euclidean over the other two acceptable options:

- **Cosine similarity** was rejected because it is invariant to
  magnitude - it only measures the *angle* between two vectors, not
  their size. Two ticks whose agents are proportionally similar but
  wildly different in absolute severity (e.g. every agent at risk 5
  vs. every agent at risk 95) would score as near-identical under
  cosine. For a safety-incident matcher that is actively misleading -
  overall severity has to matter, not just the shape of the
  contribution.
- **Weighted Manhattan (L1)** distance was considered and would also
  be defensible (it is simpler and every feature's contribution to the
  total is linear). Euclidean (L2) was preferred because squaring each
  weighted difference before summing means one feature that differs a
  lot contributes more than the same total difference spread thinly
  across several features - matching the safety intuition that an
  incident which agrees on almost everything but is wildly different
  on, say, permit risk should be considered *less* similar than the
  raw sum of differences alone would suggest.

Weights below are a fixed, documented table - not learned, not tuned
against any dataset. Each weight is a deliberate editorial judgement
about how much that feature should matter to "is this the same kind of
incident", recorded here so it can be audited or changed without
touching the distance math itself.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from src.historical.feature_vector import FEATURE_NAMES, FeatureVector

#: One weight per dimension of `FeatureVector.as_tuple()`, in the same
#: order as `FEATURE_NAMES`. Larger = matters more to "is this
#: similar". Documented per-feature below rather than left as bare
#: numbers.
FEATURE_WEIGHTS: dict[str, float] = {
    "gas_risk": 1.0,  # one of four real hazard-agent signals
    "equipment_risk": 1.0,  # one of four real hazard-agent signals
    "worker_risk": 1.0,  # one of four real hazard-agent signals
    "permit_risk": 1.0,  # one of four real hazard-agent signals
    "compound_risk_score": 1.5,  # overall severity - the single most safety-relevant number
    "confidence": 0.5,  # least safety-critical dimension; still worth weighing in lightly
    "tier_ordinal": 1.5,  # operational status - weighted alongside compound score
    "interaction_bonus": 1.0,  # single-cause vs. SIMOPS-style compounding incidents
    "triggered_agent_count": 0.75,  # how widespread the incident was, secondary to which agents
}

_WEIGHT_VECTOR: tuple[float, ...] = tuple(FEATURE_WEIGHTS[name] for name in FEATURE_NAMES)


@dataclass(frozen=True)
class SimilarityResult:
    similarity: float  # 0 (nothing alike) .. 1 (identical)
    distance: float  # raw weighted Euclidean distance, for anyone who wants the unbounded number


def weighted_euclidean_distance(a: FeatureVector, b: FeatureVector) -> float:
    """sqrt(sum(weight_i * (a_i - b_i)^2)) over the 9 documented
    dimensions. Pure arithmetic - no randomness, no external state."""
    a_values = a.as_tuple()
    b_values = b.as_tuple()
    total = 0.0
    for weight, a_value, b_value in zip(_WEIGHT_VECTOR, a_values, b_values, strict=True):
        diff = a_value - b_value
        total += weight * diff * diff
    return math.sqrt(total)


def similarity_score(a: FeatureVector, b: FeatureVector) -> SimilarityResult:
    """Distance -> bounded similarity. `1 / (1 + distance)` is a
    standard, monotonic, deterministic transform: distance 0 maps to
    similarity 1.0, and similarity strictly decreases as distance
    grows, asymptoting to 0 rather than going negative - no feature
    scaling choice can produce an out-of-range score."""
    distance = weighted_euclidean_distance(a, b)
    return SimilarityResult(similarity=1.0 / (1.0 + distance), distance=distance)


def matching_and_differing_features(
    a: FeatureVector, b: FeatureVector, tolerance: float = 10.0
) -> tuple[list[str], list[str]]:
    """Human-readable feature agreement for M24 Part 5's "matching
    features" / "differing features" fields. A numeric feature
    "matches" when its two raw (unweighted, un-rescaled) values are
    within `tolerance` of each other; `triggered_agents` matches
    per-agent via set membership rather than a tolerance, since it is
    categorical, not continuous."""
    matching: list[str] = []
    differing: list[str] = []

    numeric_pairs = (
        ("gas_risk", a.gas_risk, b.gas_risk),
        ("equipment_risk", a.equipment_risk, b.equipment_risk),
        ("worker_risk", a.worker_risk, b.worker_risk),
        ("permit_risk", a.permit_risk, b.permit_risk),
        ("compound_risk_score", a.compound_risk_score, b.compound_risk_score),
    )
    for name, a_value, b_value in numeric_pairs:
        (matching if abs(a_value - b_value) <= tolerance else differing).append(name)

    (matching if a.tier_ordinal == b.tier_ordinal else differing).append("operational_status")
    (matching if (a.interaction_bonus > 1.0) == (b.interaction_bonus > 1.0) else differing).append(
        "interaction_bonus"
    )

    for agent in sorted(a.triggered_agents | b.triggered_agents):
        in_a = agent in a.triggered_agents
        in_b = agent in b.triggered_agents
        (matching if in_a == in_b else differing).append(f"triggered:{agent}")

    return matching, differing
