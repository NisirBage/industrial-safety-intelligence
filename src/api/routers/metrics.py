"""GET /metrics - Prometheus scrape endpoint (M10).

Deliberately mounted at the bare path (no ``/api/v1`` prefix, see
``src/api/main.py``) since that's the standard Prometheus convention
scrapers expect, not this project's own versioned API surface.
"""

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

router = APIRouter()


@router.get("/metrics")
def get_metrics() -> Response:
    """Return current metrics in Prometheus's text exposition format."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
