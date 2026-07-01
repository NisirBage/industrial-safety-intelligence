"""Transport layer: FastAPI routers, WebSocket handlers, request/response models.

Exists as the outermost layer of the api -> services -> domain -> infra
dependency chain; it may import services but must contain no business
logic itself. M0 populates only ``main.py`` and ``routers/health.py``.
M6 adds the real REST API, M7 adds WebSocket streaming.
"""
