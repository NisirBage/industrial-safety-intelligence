"""Health check route.

Exists as M0's only real endpoint: it proves the FastAPI app, its
routing, and the container/Compose wiring all work end to end before
any business logic exists. ``src/api/main.py`` depends on this
module; the M0 completion criterion ("fresh clone -> docker compose
up -> GET /api/v1/health returns 200") depends on this file.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def get_health() -> dict[str, str]:
    """Report that the API process is up and serving requests."""
    return {"status": "ok"}
