"""Time Machine replay REST router - ``GET /replay``.

Read-only: orchestrates a call into `src/services/replay.py`'s
`build_replay` and shapes the response. Accepts either a catalog
`scenario_key` (resolved via the existing, unmodified
`get_scenario_summary`) or an explicit `zone_ids`/`start`/`end` window
(for ephemeral Scenario Builder executions, which are never written
to the catalog by design).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.dependencies import get_db_session
from src.api.schemas.replay import (
    ReplayBookmarkResponse,
    ReplayResponse,
    ZoneReplayTimelineResponse,
)
from src.api.schemas.risk import RiskAssessmentResponse
from src.services.replay import build_replay
from src.services.scenario_catalog import get_scenario_summary

router = APIRouter(prefix="/replay", tags=["replay"])


@router.get(
    "",
    response_model=ReplayResponse,
    summary="Build a Time Machine replay from persisted data",
    description="Either pass `scenario_key` (a Scenario Library entry) or all three of "
    "`zone_ids` (comma-separated UUIDs), `start`, and `end` (ISO 8601) for an ad-hoc window - "
    "e.g. a Scenario Builder execution result, which is never saved to the catalog. Every "
    "value returned is a persisted RiskAssessment/Permit row or a pure derivation over one "
    "(a bookmark) - nothing is computed or recomputed here.",
    responses={
        400: {
            "model": ErrorResponse,
            "description": "Neither scenario_key nor a full zone_ids/start/end window was given.",
        },
        404: {"model": ErrorResponse, "description": "No scenario with this scenario_key."},
    },
)
def get_replay(
    scenario_key: str | None = None,
    zone_ids: str | None = Query(default=None, description="Comma-separated zone UUIDs."),
    start: datetime | None = None,
    end: datetime | None = None,
    session: Session = Depends(get_db_session),
) -> ReplayResponse:
    if scenario_key is not None:
        summary = get_scenario_summary(scenario_key)
        if summary is None:
            raise APIError(
                status_code=404,
                code="SCENARIO_NOT_FOUND",
                message=f"No scenario {scenario_key!r}",
            )
        resolved_zone_ids = summary.zone_ids
        resolved_start, resolved_end = summary.start_time, summary.end_time
    elif zone_ids is not None and start is not None and end is not None:
        resolved_zone_ids = [uuid.UUID(z.strip()) for z in zone_ids.split(",") if z.strip()]
        resolved_start, resolved_end = start, end
    else:
        raise APIError(
            status_code=400,
            code="MISSING_REPLAY_TARGET",
            message="Pass either scenario_key, or all of zone_ids, start, and end.",
        )

    data = build_replay(session, resolved_zone_ids, resolved_start, resolved_end)

    return ReplayResponse(
        zone_ids=data.zone_ids,
        start_time=data.start_time,
        end_time=data.end_time,
        duration_minutes=data.duration_minutes,
        tick_count=data.tick_count,
        zone_timelines=[
            ZoneReplayTimelineResponse(
                zone_id=t.zone_id,
                assessments=[RiskAssessmentResponse.model_validate(a) for a in t.assessments],
            )
            for t in data.zone_timelines
        ],
        bookmarks=[
            ReplayBookmarkResponse(
                timestamp=b.timestamp,
                zone_id=b.zone_id,
                kind=b.kind,
                label=b.label,
                assessment_id=b.assessment_id,
            )
            for b in data.bookmarks
        ],
    )
