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

from src.api.common.pagination import PaginatedResponse, PaginationParams, pagination_params
from src.api.dependencies import get_db_session
from src.api.schemas.risk import RiskAssessmentResponse
from src.infra.db.repositories import RiskAssessmentRepository

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get(
    "/current",
    response_model=list[RiskAssessmentResponse],
    summary="Current risk snapshot for every zone",
)
def get_current_risk(
    session: Session = Depends(get_db_session),
) -> list[RiskAssessmentResponse]:
    rows = RiskAssessmentRepository(session).latest_for_all_zones()
    return [RiskAssessmentResponse.model_validate(row) for row in rows]


@router.get(
    "/history/{zone_id}",
    response_model=PaginatedResponse[RiskAssessmentResponse],
    summary="Paginated risk assessment history for one zone",
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
