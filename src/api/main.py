"""FastAPI application entrypoint.

Exists as the single place that assembles routers into the served
app. M0 wires only the health router; M6 onward adds the real REST
API here, M7 adds WebSocket routes. Depends on ``src/config/settings``
for app metadata and on ``src/api/routers/health`` for the one route
M0 requires. Run with: ``uvicorn src.api.main:app``.
"""

from fastapi import FastAPI

from src.api.routers import health
from src.config.settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.include_router(health.router, prefix="/api/v1")
