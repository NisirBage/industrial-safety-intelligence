"""Permit Reasoning Framework (M4A) - Technical Review Section 4.2.

Scope discipline: this module contains representations, configurable
policy, and pure validation/decision helpers only. It does NOT contain
a ``PermitIntelligenceAgent`` class, does not implement the ``Agent``
protocol, and does not perform any status state transition - those
are the actual "permit status state machine" the Master Plan assigns
to this file, deliberately deferred to M4B. M4A exists so that
representation and policy design happen once, reviewed on their own,
before state-transition logic is layered on top of them.

Three deliberately distinct categories live in this file:

- **Observed facts** (``PermitRecord``, ``PermitBaselineSnapshot``,
  ``AdjacentZoneStatus``): what is or was true, snapshotted or
  reported by a caller. Never computed by this module.
- **Configurable policy** (``PermitReasoningConfig``): tunable
  thresholds and the incompatible-permit-type table, independent of
  any other agent's configuration, following the established
  discipline (Gas Risk/Equipment Status/Worker Exposure's own
  independent constants).
- **Resulting decisions** (``BaselineDeltaAssessment``,
  ``SimopsConflict``): the typed, evidence-carrying output of applying
  policy to facts - never a bare boolean, so every decision remains
  independently explainable.

Zero I/O, like the rest of ``src/domain/``. Cross-zone facts
(``AdjacentZoneStatus``) travel through ``AgentInput.context``, never
``upstream_results`` - ``upstream_results`` is scoped to same-zone
agent outputs only (M4A clarification 1); a SIMOPS check inherently
needs another zone's data, which ``upstream_results`` (keyed by agent
name, not zone) cannot represent.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

# --- Observed facts ---------------------------------------------------------

PermitStatus = Literal["active", "flagged", "suspend_recommended", "closed"]
"""Matches src/infra/db/models/permit.py's PERMIT_STATUSES CHECK values
exactly (M4A clarification 2) - not the Technical Review/Master Plan's
uppercase VALID/FLAGGED/SUSPEND_RECOMMENDED prose, which M1's own
schema_decisions.md already reconciled to this lowercase vocabulary."""


@dataclass(frozen=True)
class PermitBaselineSnapshot:
    """What was true when a permit was issued - written once, per M1's
    "baseline_snapshot JSONB is written at issuance and never mutated
    afterward, only compared against."

    Carries its own ``algorithm_version``, separate from
    ``PermitReasoningConfig.algorithm_version``: a permit issued under
    one version of the reasoning module may be re-validated later
    against a newer config, and the snapshot must remain able to say
    which version originally produced its numbers, for auditability
    (M4A clarification 3).
    """

    schema_version: int
    algorithm_version: int
    gas_risk_at_issuance: float
    confidence_at_issuance: float
    captured_at: datetime


@dataclass(frozen=True)
class PermitRecord:
    """One permit as currently persisted, scoped to the zone under evaluation."""

    identifier: str
    permit_type: str  # matches permits.permit_type's CHECK values
    zone_id: uuid.UUID
    status: PermitStatus
    baseline: PermitBaselineSnapshot


@dataclass(frozen=True)
class AdjacentZoneStatus:
    """One adjacent zone's SIMOPS-relevant facts.

    ``gas_risk_score`` approximates Technical Review 4.2's "the
    connecting corridor" - no dedicated corridor entity exists in the
    approved schema (only ``zones`` and ``zone_adjacency``), so the
    adjacent zone's own Gas Risk score is used as the best available
    proxy (M4A clarification 5). This is an approximation, stated
    plainly, not a claim that a corridor is being modeled directly.
    """

    zone_id: uuid.UUID
    active_permit_types: frozenset[str]
    gas_risk_score: float


# --- Configurable policy -----------------------------------------------------


def _default_incompatible_pairs() -> frozenset[frozenset[str]]:
    # Technical Review 4.2's own example: hot work adjacent to confined
    # space entry. Not given as an exhaustive table anywhere - this is
    # the one pair the source document actually names.
    return frozenset({frozenset({"hot_work", "confined_space"})})


@dataclass(frozen=True)
class PermitReasoningConfig:
    """Immutable, tunable parameters for permit reasoning policy.

    Every threshold and the incompatible-pairs table live here, not
    embedded inside the helper functions below (M4A clarification 4),
    so a policy change is a config change, never a code change.
    Independent of every other agent's configuration, per this
    project's standing "no shared/imported constants" discipline.
    """

    algorithm_name: str = "permit_reasoning"
    algorithm_version: int = 1
    # Not given a numeric value anywhere in the source documents -
    # proposed, not cited.
    risk_delta_threshold: float = 20.0
    incompatible_permit_pairs: frozenset[frozenset[str]] = field(
        default_factory=_default_incompatible_pairs
    )
    # Reuses the cited WATCH/ELEVATED convention (Technical Review 5.6)
    # for judging whether an adjacent zone's own risk is high enough to
    # make a SIMOPS conflict live - independently configured here, not
    # imported from Gas Risk or Worker Exposure.
    adjacent_zone_elevated_threshold: float = 65.0


# --- Resulting decisions ------------------------------------------------------


@dataclass(frozen=True)
class BaselineDeltaAssessment:
    """The outcome of comparing live zone risk to a permit's baseline.

    Carries the raw numbers that produced ``exceeded``, not just the
    boolean itself, so the decision is independently verifiable.
    """

    baseline_gas_risk: float
    live_gas_risk: float
    delta: float
    threshold: float
    exceeded: bool


@dataclass(frozen=True)
class SimopsConflict:
    """One detected SIMOPS conflict: an adjacent zone holding an
    incompatible permit type while its own (corridor-approximating)
    gas risk is elevated.
    """

    adjacent_zone_id: uuid.UUID
    permit_type: str
    conflicting_permit_type: str
    adjacent_gas_risk: float


def assess_baseline_delta(
    baseline: PermitBaselineSnapshot,
    live_gas_risk: float,
    config: PermitReasoningConfig,
) -> BaselineDeltaAssessment:
    """Compares live zone risk to the permit's baseline-at-issuance,
    per Technical Review 4.2: "compare live zone risk to baseline plus
    a delta threshold."
    """
    delta = live_gas_risk - baseline.gas_risk_at_issuance
    return BaselineDeltaAssessment(
        baseline_gas_risk=baseline.gas_risk_at_issuance,
        live_gas_risk=live_gas_risk,
        delta=delta,
        threshold=config.risk_delta_threshold,
        exceeded=delta > config.risk_delta_threshold,
    )


def _is_incompatible_pair(type_a: str, type_b: str, config: PermitReasoningConfig) -> bool:
    return frozenset({type_a, type_b}) in config.incompatible_permit_pairs


def detect_simops_conflicts(
    permit_type: str,
    adjacent_zones: Sequence[AdjacentZoneStatus],
    config: PermitReasoningConfig,
) -> list[SimopsConflict]:
    """Checks whether any adjacent zone holds an incompatible permit
    type while its own gas risk is elevated, per Technical Review
    4.2's SIMOPS decision logic.
    """
    conflicts: list[SimopsConflict] = []
    for adjacent in adjacent_zones:
        if adjacent.gas_risk_score < config.adjacent_zone_elevated_threshold:
            continue
        for other_type in adjacent.active_permit_types:
            if _is_incompatible_pair(permit_type, other_type, config):
                conflicts.append(
                    SimopsConflict(
                        adjacent_zone_id=adjacent.zone_id,
                        permit_type=permit_type,
                        conflicting_permit_type=other_type,
                        adjacent_gas_risk=adjacent.gas_risk_score,
                    )
                )
    return conflicts
