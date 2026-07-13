"""FastAPI application entrypoint.

Exists as the single place that assembles routers into the served
app. M0 wired only the health router; M6 adds the core REST API here
(risk, permits, audit - all read-only, consuming the frozen
deterministic engine's already-persisted output), M7 adds WebSocket
routes. Depends on ``src/config/settings`` for app metadata and on
``src/api/routers/*`` for its routes. Run with:
``uvicorn src.api.main:app``.

The three exception handlers registered below are what make the
shared error contract (``src/api/common/errors.py``) apply uniformly:
an explicit ``APIError``, a request validation failure, and an
uncaught exception all produce the same ``{"error": {...}}`` envelope
shape, regardless of which router raised.

M10 additions: structured startup/shutdown logging (via
``src/config/logging.py``'s existing formatter, already used by the
agents - nothing new invented here), a request-logging +
Prometheus-instrumentation middleware, and expanded OpenAPI metadata.
None of this touches a router's business logic or the deterministic
engine.
"""

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from src.api.common.errors import (
    APIError,
    handle_api_error,
    handle_unexpected_error,
    handle_validation_error,
)
from src.api.common.metrics import REQUEST_COUNT, REQUEST_DURATION
from src.api.routers import (
    audit,
    compliance,
    counterfactual,
    foresight,
    graph,
    health,
    historical,
    ingest,
    metrics,
    permits,
    replay,
    risk,
    scenario_builder,
    scenarios,
    workers,
    zones,
)
from src.config.logging import configure_logging
from src.config.settings import get_settings

configure_logging()
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("application startup: %s v%s", settings.app_name, app.version)
    yield
    logger.info("application shutdown: %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "REST API over the Industrial Safety Intelligence Platform's "
        "deterministic Compound Risk Engine. Every value returned here "
        "(risk score, confidence, tier, justification) is read directly "
        "from what the engine already computed and persisted - this API "
        "computes nothing itself. Almost every endpoint is read-only; "
        "the sole exception is the Scenario Builder's `/scenario-builder/"
        "execute` (and its `/validate` dry run), which assembles a "
        "scenario from user input and runs it through the same "
        "unmodified pipeline every pre-authored scenario already goes "
        "through. See docs/architecture/CORE_FREEZE.md for the engine "
        "this API consumes, and each router's own docstring for "
        "endpoint-level detail."
    ),
    lifespan=lifespan,
)

# M8's browser dashboard is served from a different origin/port than
# this API, so without CORS headers the browser blocks every response
# regardless of the server returning 200 - confirmed during M9's live
# frontend+backend verification. `allow_origins` is an explicit list
# (never "*"), so `allow_credentials=True` is safe per the CORS spec.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_and_measure_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """One place recording both structured request logs and Prometheus
    metrics for every request, rather than repeating either concern in
    each router. Uses the *route template* (e.g.
    ``/api/v1/risk/history/{zone_id}``) for metric labels, never the
    resolved path - a raw path would put a distinct UUID in every
    label value and make the metric's cardinality grow without bound.
    """
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    route = request.scope.get("route")
    path_label = route.path if route is not None else request.url.path

    REQUEST_COUNT.labels(
        method=request.method, path=path_label, status_code=response.status_code
    ).inc()
    REQUEST_DURATION.labels(method=request.method, path=path_label).observe(duration)

    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration * 1000,
    )
    return response


app.add_exception_handler(APIError, handle_api_error)
app.add_exception_handler(RequestValidationError, handle_validation_error)
app.add_exception_handler(Exception, handle_unexpected_error)

app.include_router(health.router, prefix="/api/v1")
app.include_router(risk.router, prefix="/api/v1")
app.include_router(permits.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(zones.router, prefix="/api/v1")
app.include_router(counterfactual.router, prefix="/api/v1")
app.include_router(scenarios.router, prefix="/api/v1")
app.include_router(workers.router, prefix="/api/v1")
app.include_router(scenario_builder.router, prefix="/api/v1")
app.include_router(replay.router, prefix="/api/v1")
app.include_router(historical.router, prefix="/api/v1")
app.include_router(foresight.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(compliance.router, prefix="/api/v1")
app.include_router(ingest.router, prefix="/api/v1")
app.include_router(metrics.router)
