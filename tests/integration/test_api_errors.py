"""Integration tests for the shared error contract.

Exercises the real FastAPI app object and its registered exception
handlers (Starlette routing needs a live app, not a pure function -
the same reasoning tests/integration/test_health.py already states).
Does not require a database: the two validation-style errors are
raised before any repository call ever runs, and the internal-error
path is triggered via a dependency override rather than a real DB
failure, so this test's outcome doesn't depend on whether Docker is
running.
"""

from collections.abc import Iterator

from fastapi.testclient import TestClient

from src.api.dependencies import get_db_session
from src.api.main import app

client = TestClient(app)


def test_invalid_status_returns_shared_error_envelope() -> None:
    response = client.get("/api/v1/permits", params={"status": "not-a-real-status"})

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_STATUS"
    assert "not-a-real-status" in body["error"]["message"]


def test_invalid_event_type_returns_shared_error_envelope() -> None:
    response = client.get("/api/v1/audit", params={"event_type": "not-a-real-event"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_EVENT_TYPE"


def test_malformed_uuid_returns_validation_error_envelope() -> None:
    response = client.get("/api/v1/risk/history/not-a-uuid")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["error"]["details"]


def test_limit_out_of_range_returns_validation_error_envelope() -> None:
    response = client.get("/api/v1/permits", params={"limit": 5000})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unhandled_exception_returns_internal_error_envelope() -> None:
    def _broken_session() -> Iterator[None]:
        raise RuntimeError("boom")
        yield  # pragma: no cover - unreachable, satisfies generator typing

    app.dependency_overrides[get_db_session] = _broken_session
    try:
        broken_client = TestClient(app, raise_server_exceptions=False)
        response = broken_client.get("/api/v1/risk/current")
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An internal error occurred.",
            "details": None,
        }
    }
