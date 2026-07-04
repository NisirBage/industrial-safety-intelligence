"""Risk REST router - ``GET /risk/current``, ``GET /risk/history/{zone_id}``.

Orchestrates only: validate the request, call the persistence layer
through the injected session, shape the response. No risk, tier, or
confidence computation happens here - every value already exists,
written by the frozen Risk Pipeline before this router ever runs
(``docs/architecture/CORE_FREEZE.md``).
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.common.pagination import PaginatedResponse, PaginationParams, pagination_params
from src.api.dependencies import get_db_session
from src.api.schemas.risk import RiskAssessmentResponse
from src.infra.db.repositories import RiskAssessmentRepository

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get(
    "/current",
    response_model=list[RiskAssessmentResponse],
    summary="Current risk snapshot for every zone",
    description="One row per zone: its most recently persisted RiskAssessment. Returns an "
    "empty list if no assessment has ever been persisted (a genuinely empty plant, not an "
    "error) - see docs/architecture/CORE_FREEZE.md for how these rows are produced.",
)
def get_current_risk(
    session: Session = Depends(get_db_session),
) -> list[RiskAssessmentResponse]:
    rows = RiskAssessmentRepository(session).latest_for_all_zones()
    return [RiskAssessmentResponse.model_validate(row) for row in rows]


@router.get(
    "/assessment/{assessment_id}",
    response_model=RiskAssessmentResponse,
    summary="One risk assessment by id (Decision Intelligence Layer)",
    description="For deep-linking a single assessment (explainability dashboard, research "
    "mode) without re-fetching a whole history page. 404 if the id doesn't exist - unlike a "
    "zone-scoped list, this is a single-resource lookup where 'not found' is a real error, "
    "not an empty collection.",
    responses={404: {"model": ErrorResponse, "description": "No assessment with this id."}},
)
def get_risk_assessment(
    assessment_id: uuid.UUID,
    session: Session = Depends(get_db_session),
) -> RiskAssessmentResponse:
    row = RiskAssessmentRepository(session).get(assessment_id)
    if row is None:
        raise APIError(
            status_code=404,
            code="ASSESSMENT_NOT_FOUND",
            message=f"No risk assessment with id {assessment_id}",
        )
    return RiskAssessmentResponse.model_validate(row)


@router.get(
    "/history/{zone_id}",
    response_model=PaginatedResponse[RiskAssessmentResponse],
    summary="Paginated risk assessment history for one zone",
    description="Newest-first. An unknown zone_id returns an empty page (count=0), not a "
    "404 - this endpoint has no way to distinguish 'zone exists but has no history yet' from "
    "'zone_id was never real', so it treats both identically rather than guessing.",
    responses={422: {"model": ErrorResponse, "description": "zone_id is not a valid UUID."}},
)
def get_risk_history(
    zone_id: uuid.UUID,
    pagination: PaginationParams = Depends(pagination_params),
    session: Session = Depends(get_db_session),
) -> PaginatedResponse[RiskAssessmentResponse]:
    rows = RiskAssessmentRepository(session).history_by_zone(
        zone_id, pagination.limit, pagination.before, pagination.after
    )
    items = [RiskAssessmentResponse.model_validate(row) for row in rows]
    return PaginatedResponse(items=items, limit=pagination.limit, count=len(items))
