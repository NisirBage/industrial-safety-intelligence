"""Workers REST router - ``GET /workers`` (Scenario Builder).

Orchestrates only: calls the already-existing ``WorkerRepository``
(extended with ``list_all`` for this), shapes the response. Plant
metadata, never a risk value.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.dependencies import get_db_session
from src.api.schemas.workers import WorkerResponse
from src.infra.db.repositories import WorkerRepository

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get(
    "",
    response_model=list[WorkerResponse],
    summary="List every worker",
    description="Plant metadata only. Backs the Scenario Builder's authorizing-officer "
    "picker - a permit event's officer isn't necessarily positioned in the zone the "
    "permit covers, so this is a global list rather than zone-scoped.",
)
def list_workers(session: Session = Depends(get_db_session)) -> list[WorkerResponse]:
    rows = WorkerRepository(session).list_all()
    return [WorkerResponse.model_validate(row) for row in rows]
