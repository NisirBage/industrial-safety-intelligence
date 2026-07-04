"""Health check route.

Exists as M0's only real endpoint: it proves the FastAPI app, its
routing, and the container/Compose wiring all work end to end before
any business logic exists. ``src/api/main.py`` depends on this
module; the M0 completion criterion ("fresh clone -> docker compose
up -> GET /api/v1/health returns 200") depends on this file.

M10 expands it to check real readiness (database connectivity and
migration version) rather than just "the process is running" - the
distinction Docker Compose's ``depends_on: condition: service_healthy``
and any real orchestrator both need. This only touches
``src/infra/db/session.py``'s already-existing ``engine`` (infra
wiring, not the deterministic engine) and a raw read of the
``alembic_version`` table - no domain, agent, scheduler, fusion,
tiering, justification, counterfactual, or context-builder code is
involved.
"""

import logging

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from src.infra.db.session import engine

logger = logging.getLogger(__name__)

router = APIRouter()


class HealthResponse(BaseModel):
    """Overall readiness plus the two checks that make it up."""

    status: str
    database: str
    migration_version: str | None = None


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={
        503: {"model": HealthResponse, "description": "Database unreachable or unmigrated."}
    },
)
def get_health(response: Response) -> HealthResponse:
    """Report whether the API can actually serve requests: the process
    is up (trivially true if this handler runs at all), the database
    is reachable, and the schema is migrated to a known revision.
    Returns 503 rather than 200 if either database check fails, so a
    healthcheck or `depends_on: condition: service_healthy` correctly
    treats an unmigrated or unreachable database as "not ready"."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            version_row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
    except Exception:
        logger.exception("health check: database unreachable")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="error", database="unreachable")

    if version_row is None:
        logger.error("health check: database reachable but no migration has been applied")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="error", database="connected", migration_version=None)

    return HealthResponse(status="ok", database="connected", migration_version=version_row[0])
