"""Audit REST router - ``GET /audit``.

Read-only, matching ``AuditLogRepository``'s own scope: nothing writes
an audit entry yet (deferred, see that repository's docstring), so
this endpoint correctly returns an empty list until a future
milestone adds a writer - not a bug, the same "confirmed empty, not
missing" distinction this project applies everywhere else.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.common.pagination import PaginatedResponse, PaginationParams, pagination_params
from src.api.dependencies import get_db_session
from src.api.schemas.audit import AuditLogResponse
from src.infra.db.models.audit_log import AUDIT_EVENT_TYPES
from src.infra.db.repositories import AuditLogRepository

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get(
    "",
    response_model=PaginatedResponse[AuditLogResponse],
    summary="List audit log entries, optionally filtered by zone and/or event type",
    description="Currently always returns an empty page: the hash-chained audit-log writer "
    "is deferred (see src/infra/db/repositories/audit_log_repository.py), so this endpoint's "
    "read path is real but nothing has written to it yet.",
    responses={
        400: {"model": ErrorResponse, "description": "event_type is not a recognized value."}
    },
)
def list_audit_entries(
    zone_id: uuid.UUID | None = Query(None, description="Restrict to events in this zone."),
    event_type: str | None = Query(None, description=f"One of: {', '.join(AUDIT_EVENT_TYPES)}"),
    pagination: PaginationParams = Depends(pagination_params),
    session: Session = Depends(get_db_session),
) -> PaginatedResponse[AuditLogResponse]:
    if event_type is not None and event_type not in AUDIT_EVENT_TYPES:
        raise APIError(
            status_code=400,
            code="INVALID_EVENT_TYPE",
            message=f"event_type must be one of {AUDIT_EVENT_TYPES}, got {event_type!r}",
        )

    rows = AuditLogRepository(session).list_all(
        zone_id, event_type, pagination.limit, pagination.before, pagination.after
    )
    items = [AuditLogResponse.model_validate(row) for row in rows]
    return PaginatedResponse(items=items, limit=pagination.limit, count=len(items))
