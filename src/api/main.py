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
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from src.api.common.errors import (
    APIError,
    handle_api_error,
    handle_unexpected_error,
    handle_validation_error,
)
from src.api.routers import audit, health, permits, risk
from src.config.settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version="1.0.0")

# M8's browser dashboard is served from a different origin/port than
# this API, so without CORS headers the browser blocks every response
# regardless of the server returning 200 - confirmed during M9's live
# frontend+backend verification. Methods restricted to GET since every
# route in src/api/routers/* is read-only today.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.add_exception_handler(APIError, handle_api_error)
app.add_exception_handler(RequestValidationError, handle_validation_error)
app.add_exception_handler(Exception, handle_unexpected_error)

app.include_router(health.router, prefix="/api/v1")
app.include_router(risk.router, prefix="/api/v1")
app.include_router(permits.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
