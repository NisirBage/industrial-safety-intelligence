"""Permits REST router - ``GET /permits``.

Orchestrates only: validates ``status`` against the schema's own
enum, calls the persistence layer, shapes the response. No permit
decision logic (escalation, SIMOPS, baseline comparison) lives here -
that is Permit Intelligence's frozen responsibility, already applied
by the time a permit's ``status`` was written.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError
from src.api.common.pagination import PaginatedResponse, PaginationParams, pagination_params
from src.api.dependencies import get_db_session
from src.api.schemas.permits import PermitResponse
from src.infra.db.models.permit import PERMIT_STATUSES
from src.infra.db.repositories import PermitRepository

router = APIRouter(prefix="/permits", tags=["permits"])


@router.get(
    "",
    response_model=PaginatedResponse[PermitResponse],
    summary="List permits, optionally filtered by zone and/or status",
)
def list_permits(
    zone_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None, description=f"One of: {', '.join(PERMIT_STATUSES)}"),
    pagination: PaginationParams = Depends(pagination_params),
    session: Session = Depends(get_db_session),
) -> PaginatedResponse[PermitResponse]:
    if status is not None and status not in PERMIT_STATUSES:
        raise APIError(
            status_code=400,
            code="INVALID_STATUS",
            message=f"status must be one of {PERMIT_STATUSES}, got {status!r}",
        )

    rows = PermitRepository(session).list_all(
        zone_id, status, pagination.limit, pagination.before, pagination.after
    )
    items = [PermitResponse.model_validate(row) for row in rows]
    return PaginatedResponse(items=items, limit=pagination.limit, count=len(items))
