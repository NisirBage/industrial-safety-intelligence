"""Time Machine replay - read-only aggregation over already-persisted
data. No computation: every value in a `ReplayData` is a `RiskAssessment`
or `Permit` row this platform already wrote, or a pure derivation over
fields those rows already carry (a bookmark is a flag, never a
recomputed risk/tier/score). Orchestration only, per CORE_FREEZE.md §9
("extending src/services/*.py with new orchestration... this layer is
wiring, not frozen math").

`build_replay` is the single entry point `GET /replay` calls. It never
runs a scenario and never writes anything - it only reads
`RiskAssessmentRepository.history_by_zone` and `PermitRepository.
list_all`, both pre-existing.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from src.infra.db.models.permit import Permit
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.repositories import PermitRepository, RiskAssessmentRepository

_HISTORY_LIMIT = 5000  # comfortably above the "1000+ ticks" requirement


@dataclass(frozen=True)
class ReplayBookmark:
    timestamp: datetime
    zone_id: uuid.UUID
    kind: str  # tier_change | critical | interaction_bonus | permit_activated | highest_risk
    label: str
    assessment_id: uuid.UUID | None


@dataclass(frozen=True)
class ZoneReplayTimeline:
    zone_id: uuid.UUID
    assessments: list[RiskAssessment]  # ascending by timestamp


@dataclass(frozen=True)
class ReplayData:
    zone_ids: list[uuid.UUID]
    start_time: datetime
    end_time: datetime
    duration_minutes: float
    zone_timelines: list[ZoneReplayTimeline]
    bookmarks: list[ReplayBookmark]
    tick_count: int


def _fetch_zone_assessments(
    session: Session, zone_id: uuid.UUID, start_time: datetime, end_time: datetime
) -> list[RiskAssessment]:
    """Ascending-time assessments within `[start_time, end_time]`
    (inclusive) - `history_by_zone`'s own `before`/`after` bounds are
    exclusive and return newest-first, so both are adjusted here
    rather than changing that repository method's established
    contract (still used, unmodified, by `GET /risk/history/{zone_id}`)."""
    rows = RiskAssessmentRepository(session).history_by_zone(
        zone_id,
        _HISTORY_LIMIT,
        before=end_time + timedelta(microseconds=1),
        after=start_time - timedelta(microseconds=1),
    )
    return sorted(rows, key=lambda row: row.timestamp)


def _tier_transition(assessment: RiskAssessment) -> tuple[str, str] | None:
    justification = assessment.justification
    tier_before = justification.get("tier_before")
    tier_after = justification.get("tier_after")
    if isinstance(tier_before, str) and isinstance(tier_after, str):
        return tier_before, tier_after
    return None


def _has_interaction_bonus(assessment: RiskAssessment) -> bool:
    rules_fired = assessment.justification.get("rules_fired", [])
    return isinstance(rules_fired, list) and "interaction_bonus_applied" in rules_fired


def _detect_bookmarks(
    zone_id: uuid.UUID, assessments: list[RiskAssessment], permits: list[Permit]
) -> list[ReplayBookmark]:
    bookmarks: list[ReplayBookmark] = []

    for assessment in assessments:
        transition = _tier_transition(assessment)
        if transition is not None:
            tier_before, tier_after = transition
            if tier_before != tier_after:
                bookmarks.append(
                    ReplayBookmark(
                        timestamp=assessment.timestamp,
                        zone_id=zone_id,
                        kind="tier_change",
                        label=f"{tier_before} → {tier_after}",
                        assessment_id=assessment.assessment_id,
                    )
                )
                if tier_after == "critical" and tier_before != "critical":
                    bookmarks.append(
                        ReplayBookmark(
                            timestamp=assessment.timestamp,
                            zone_id=zone_id,
                            kind="critical",
                            label="Reached CRITICAL",
                            assessment_id=assessment.assessment_id,
                        )
                    )

        if _has_interaction_bonus(assessment):
            multiplier = assessment.justification.get("interaction_bonus_applied")
            bookmarks.append(
                ReplayBookmark(
                    timestamp=assessment.timestamp,
                    zone_id=zone_id,
                    kind="interaction_bonus",
                    label=f"Interaction bonus applied ({multiplier}×)",
                    assessment_id=assessment.assessment_id,
                )
            )

    if assessments:
        peak = max(assessments, key=lambda a: a.compound_risk_score)
        bookmarks.append(
            ReplayBookmark(
                timestamp=peak.timestamp,
                zone_id=zone_id,
                kind="highest_risk",
                label=f"Highest risk this window ({peak.compound_risk_score:.1f})",
                assessment_id=peak.assessment_id,
            )
        )

    for permit in permits:
        bookmarks.append(
            ReplayBookmark(
                timestamp=permit.issued_at,
                zone_id=zone_id,
                kind="permit_activated",
                label=f"{permit.permit_type} permit issued",
                assessment_id=None,
            )
        )

    return bookmarks


def build_replay(
    session: Session, zone_ids: list[uuid.UUID], start_time: datetime, end_time: datetime
) -> ReplayData:
    zone_timelines: list[ZoneReplayTimeline] = []
    all_bookmarks: list[ReplayBookmark] = []
    all_timestamps: set[datetime] = set()

    permit_repo = PermitRepository(session)

    for zone_id in zone_ids:
        assessments = _fetch_zone_assessments(session, zone_id, start_time, end_time)
        zone_timelines.append(ZoneReplayTimeline(zone_id=zone_id, assessments=assessments))
        all_timestamps.update(a.timestamp for a in assessments)

        zone_permits = [
            permit
            for permit in permit_repo.list_all(zone_id, None, _HISTORY_LIMIT, None, None)
            if start_time <= permit.issued_at <= end_time
        ]
        all_bookmarks.extend(_detect_bookmarks(zone_id, assessments, zone_permits))

    all_bookmarks.sort(key=lambda b: b.timestamp)

    return ReplayData(
        zone_ids=zone_ids,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=(end_time - start_time).total_seconds() / 60,
        zone_timelines=zone_timelines,
        bookmarks=all_bookmarks,
        tick_count=len(all_timestamps),
    )
