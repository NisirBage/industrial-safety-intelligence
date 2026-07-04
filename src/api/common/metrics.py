"""Prometheus instrumentation (M10).

Exists so ops tooling can scrape request-level metrics without
touching any router or business logic - the middleware in
``src/api/main.py`` records every request here, and
``src/api/routers/metrics.py`` exposes the result. Deliberately
counts/times HTTP requests only: this is infrastructure observability,
not a place to expose anything about the deterministic engine's
internal decisions (that's what ``RiskAssessment.justification`` is
for, via the normal REST endpoints).
"""

from prometheus_client import Counter, Histogram

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests received.",
    ["method", "path", "status_code"],
)

REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ["method", "path"],
)
