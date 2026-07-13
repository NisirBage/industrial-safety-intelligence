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
import time

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from src.api.schemas.platform_health import PlatformHealthResponse, SubsystemCheck
from src.historical.decks import HISTORICAL_DECKS
from src.infra.db.session import engine
from src.knowledge_graph.recommendation_text import RULE_RECOMMENDATIONS, TIER_BASELINE
from src.services.scenario_catalog import load_catalog

logger = logging.getLogger(__name__)

router = APIRouter()

#: Mirrors src/api/main.py's `FastAPI(version=...)` - duplicated here
#: rather than imported to avoid a circular import (main.py imports
#: this router).
_PLATFORM_VERSION = "1.0.0"


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


def _database_check() -> SubsystemCheck:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            version_row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
    except Exception:
        logger.exception("platform health: database unreachable")
        return SubsystemCheck(name="Database", status="error", detail="unreachable")
    if version_row is None:
        return SubsystemCheck(
            name="Database", status="error", detail="connected but no migration applied"
        )
    return SubsystemCheck(
        name="Database", status="ok", detail=f"connected, migration {version_row[0]}"
    )


def _replay_engine_check() -> SubsystemCheck:
    try:
        scenarios = load_catalog()
    except Exception:
        logger.exception("platform health: scenario catalog failed to load")
        return SubsystemCheck(
            name="Replay Engine", status="error", detail="scenario catalog unreadable"
        )
    if not scenarios:
        return SubsystemCheck(
            name="Replay Engine", status="degraded", detail="no scenarios cataloged"
        )
    return SubsystemCheck(
        name="Replay Engine", status="ok", detail=f"{len(scenarios)} scenario(s) cataloged"
    )


def _historical_intelligence_check() -> SubsystemCheck:
    if not HISTORICAL_DECKS:
        return SubsystemCheck(
            name="Historical Intelligence", status="degraded", detail="no historical decks loaded"
        )
    incident_count = sum(len(deck.incidents) for deck in HISTORICAL_DECKS)
    return SubsystemCheck(
        name="Historical Intelligence",
        status="ok",
        detail=f"{len(HISTORICAL_DECKS)} deck(s), {incident_count} incident(s)",
    )


def _operational_foresight_check() -> SubsystemCheck:
    if not HISTORICAL_DECKS:
        return SubsystemCheck(
            name="Operational Foresight",
            status="degraded",
            detail="no historical decks to derive trajectories from",
        )
    return SubsystemCheck(
        name="Operational Foresight",
        status="ok",
        detail="trajectory matching available (derives from historical decks + live replay ticks)",
    )


def _knowledge_graph_check() -> SubsystemCheck:
    vocabulary_size = len(TIER_BASELINE) + len(RULE_RECOMMENDATIONS)
    if vocabulary_size == 0:
        return SubsystemCheck(
            name="Knowledge Graph", status="degraded", detail="no recommendation vocabulary loaded"
        )
    return SubsystemCheck(
        name="Knowledge Graph",
        status="ok",
        detail=f"{vocabulary_size} recommendation template(s) loaded",
    )


def _storage_check() -> SubsystemCheck:
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT pg_size_pretty(pg_database_size(current_database()))")
            ).first()
    except Exception:
        logger.exception("platform health: storage size query failed")
        return SubsystemCheck(name="Storage", status="error", detail="unable to read database size")
    return SubsystemCheck(
        name="Storage", status="ok", detail=f"database size {row[0]}" if row else "ok"
    )


def _connectors_check() -> SubsystemCheck:
    from src.api.routers.ingest import get_connector_status

    statuses = get_connector_status().connectors
    implemented = sum(1 for c in statuses if c.mode == "implemented")
    mocked = sum(1 for c in statuses if c.mode == "mock")
    return SubsystemCheck(
        name="Live Data Connectors",
        status="ok",
        detail=f"{implemented} implemented, {mocked} mocked",
    )


@router.get(
    "/health/platform",
    response_model=PlatformHealthResponse,
    summary="Enterprise Health Dashboard - live status for every major subsystem",
)
def get_platform_health() -> PlatformHealthResponse:
    """Runs a cheap, read-only check against each subsystem this
    platform actually has (database, replay/scenario catalog,
    historical decks, foresight's inputs, knowledge graph vocabulary,
    storage, live-ingestion connectors) and reports the real result of
    each - no subsystem's status is invented or assumed."""
    start = time.monotonic()
    checks = [
        SubsystemCheck(name="API", status="ok", detail="process responding"),
        _database_check(),
        _replay_engine_check(),
        _historical_intelligence_check(),
        _operational_foresight_check(),
        _knowledge_graph_check(),
        _storage_check(),
        _connectors_check(),
    ]
    latency_ms = (time.monotonic() - start) * 1000

    if any(c.status == "error" for c in checks):
        overall = "error"
    elif any(c.status == "degraded" for c in checks):
        overall = "degraded"
    else:
        overall = "ok"

    return PlatformHealthResponse(
        status=overall,
        version=_PLATFORM_VERSION,
        latency_ms=round(latency_ms, 2),
        checks=checks,
    )
