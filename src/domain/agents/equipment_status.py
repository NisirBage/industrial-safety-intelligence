"""Equipment Status Agent - Technical Review Section 4.4; common-cause
heuristic per Domain Research Report Part 2.

Counts currently-degraded independent protection layers in a zone and
converts that into a risk contribution, with a common-cause-aware
grouping check: two degraded pieces of equipment of the same type are
treated as one shared-cause degradation, not two independent ones.
``EquipmentRecord`` is scoped to this file alone, following the same
pattern ``GasReading`` set in ``gas_risk.py``.

Zero I/O, like the rest of ``src/domain/`` - every value arrives via
``AgentInput.context``, populated by whichever services-layer caller
assembles it (M5/M6).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import cast

from src.domain.agents.base import AgentInput, AgentMetadata, AgentResult, Justification

_KNOWN_ISOLATION_STATUSES = ("isolated", "active", "degraded")
_DEGRADED_ISOLATION_STATUSES = ("isolated", "degraded")


@dataclass(frozen=True)
class EquipmentRecord:
    """One piece of equipment's current status. Assumed to be the
    caller's authoritative, current snapshot - this module has no way
    to know whether a record is stale, since the underlying schema
    (src/infra/db/models/equipment.py) carries no timestamp column.
    See docs/algorithms/equipment_status.md for that gap.
    """

    identifier: str
    equipment_type: str
    isolation_status: str
    maintenance_flag: bool
    loto_confirmed: bool


@dataclass(frozen=True)
class EquipmentStatusConfig:
    """Immutable, tunable parameters - the only state an
    ``EquipmentStatusAgent`` instance retains between evaluations.

    ``steepness_k`` is derived independently of Gas Risk's constant of
    the same name, using the same reasoning (r=50 at ratio=0.5)
    applied to a different ratio - see docs/algorithms/equipment_status.md.
    The two agents' constants are not shared or imported from one
    another (M3C clarification 2).
    """

    formula_version: int = 1
    steepness_k: float = 2 * math.log(2)
    missing_context_confidence: float = 0.1


def _is_degraded(record: EquipmentRecord) -> bool:
    if record.isolation_status not in _KNOWN_ISOLATION_STATUSES:
        raise ValueError(f"unrecognized isolation_status: {record.isolation_status!r}")
    return (
        record.isolation_status in _DEGRADED_ISOLATION_STATUSES
        or record.maintenance_flag
        or record.loto_confirmed
    )


def calculate_degraded_groups(equipment: Sequence[EquipmentRecord]) -> frozenset[str]:
    """Distinct ``equipment_type`` values among currently-degraded records.

    This is the common-cause heuristic (Domain Research Report Part 2):
    a conservative APPROXIMATION for independence, not a full
    common-cause analysis (M3C clarification 3) - the schema has no
    dedicated common-cause attribute (e.g. shared power bus) to check
    directly, so equipment type is the best available proxy for
    "these failures might share a cause."
    """
    return frozenset(r.equipment_type for r in equipment if _is_degraded(r))


def calculate_risk(
    degraded_group_count: int, total_type_count: int, config: EquipmentStatusConfig
) -> float:
    """Saturating function of the degraded-group ratio, reusing Gas
    Risk's mathematical family (100*(1-e^(-k*ratio))) with Equipment
    Status's own independent ``steepness_k`` (M3C clarification 2).

    Takes counts rather than the equipment list itself, so it never
    recomputes ``calculate_degraded_groups`` a caller already has, and
    so it's testable with plain integers rather than constructed
    ``EquipmentRecord`` objects.

    Returns 0.0 when there's no equipment or nothing is degraded -
    never a fabricated non-zero value (Technical Review 4.4's
    "do not fabricate degradation that wasn't logged").
    """
    if total_type_count == 0 or degraded_group_count == 0:
        return 0.0

    ratio = degraded_group_count / total_type_count
    return 100.0 * (1.0 - math.exp(-config.steepness_k * ratio))


def calculate_confidence(
    context_present: bool,
    equipment: Sequence[EquipmentRecord],
    config: EquipmentStatusConfig,
) -> float:
    """Distinguishes missing context from a confirmed-empty inventory
    (M3C clarification 4): a caller that never supplied equipment data
    at all leaves us with no information (low confidence); a caller
    that explicitly reports zero equipment is a confirmed, complete
    fact, not an information gap (full confidence).
    """
    if not context_present:
        return config.missing_context_confidence
    return 1.0


def build_justification(
    equipment: Sequence[EquipmentRecord],
    degraded_groups: frozenset[str],
    context_present: bool,
    config: EquipmentStatusConfig,
) -> Justification:
    evidence: dict[str, object] = {
        "formula_version": config.formula_version,
        "equipment_count": len(equipment),
        "distinct_equipment_types": len({r.equipment_type for r in equipment}),
        # The deduplicated protection-layer groups the common-cause
        # heuristic collapsed multiple records into (M3C clarification 7).
        "degraded_protection_layer_groups": sorted(degraded_groups),
        "degraded_group_count": len(degraded_groups),
    }

    if not context_present:
        return Justification(
            summary=(
                "No equipment status data available; "
                "reporting zero degradation with low confidence."
            ),
            rules_fired=["missing_equipment_context"],
            evidence=evidence,
        )
    if not equipment:
        return Justification(
            summary="Confirmed empty equipment inventory; zero protection layers to degrade.",
            rules_fired=["confirmed_empty_inventory"],
            evidence=evidence,
        )
    if not degraded_groups:
        return Justification(
            summary="All tracked equipment active; no degraded protection layers.",
            rules_fired=["no_degradation"],
            evidence=evidence,
        )

    summary = (
        f"{len(degraded_groups)} of {evidence['distinct_equipment_types']} equipment "
        f"type(s) have a degraded protection layer: {', '.join(sorted(degraded_groups))}."
    )
    return Justification(
        summary=summary,
        rules_fired=["common_cause_grouped_degradation_count"],
        evidence=evidence,
    )


def _extract_equipment(context: Mapping[str, object]) -> list[EquipmentRecord]:
    return cast(list[EquipmentRecord], context.get("equipment", []))


class EquipmentStatusAgent:
    """Implements the M3A ``Agent`` protocol for equipment/protection-layer status.

    Stateless with respect to simulation data: ``self._config`` is the
    only thing retained between evaluations, and it is immutable
    configuration, not simulation state.
    """

    metadata = AgentMetadata(
        name="equipment_status",
        description=(
            "Counts degraded independent protection layers per zone, "
            "with a common-cause-aware grouping heuristic."
        ),
    )

    def __init__(self, config: EquipmentStatusConfig | None = None) -> None:
        self._config = config or EquipmentStatusConfig()

    async def evaluate(self, input: AgentInput) -> AgentResult:
        context_present = "equipment" in input.context
        equipment = _extract_equipment(input.context)

        degraded_groups = calculate_degraded_groups(equipment)
        total_types = len({r.equipment_type for r in equipment})
        risk = calculate_risk(len(degraded_groups), total_types, self._config)
        confidence = calculate_confidence(context_present, equipment, self._config)
        justification = build_justification(
            equipment, degraded_groups, context_present, self._config
        )

        return AgentResult(
            agent_name=self.metadata.name,
            risk=risk,
            confidence=confidence,
            justification=justification,
            computed_at=input.sim_time,
        )
