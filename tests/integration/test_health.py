"""Smoke test for the health endpoint.

Exists because M0's testing requirement is exactly one smoke test
asserting the health endpoint responds. Lives under integration/,
not unit/, because it exercises the real FastAPI app object rather
than a pure function.
"""

from fastapi.testclient import TestClient

from src.api.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
