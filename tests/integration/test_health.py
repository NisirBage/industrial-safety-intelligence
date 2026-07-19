"""Smoke test for the health endpoint.

Exists because M0's testing requirement is exactly one smoke test
asserting the health endpoint responds. Lives under integration/,
not unit/, because it exercises the real FastAPI app object rather
than a pure function. M10 expanded the endpoint to check real
database connectivity and migration version (src/api/routers/health.py),
so this test now needs the same migrate/downgrade fixture every other
DB-backed integration test in this package already uses - not runnable
without a live Postgres instance, same as the rest of tests/integration/.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from src.api.main import app

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _migrated_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


def test_health_returns_ok_with_a_migrated_database() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["migration_version"] == "0002"


def test_health_returns_503_without_a_migrated_database() -> None:
    command.downgrade(Config(str(ALEMBIC_INI)), "base")

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["database"] == "connected"
    assert body["migration_version"] is None

    # Restore so this test's own autouse teardown (upgrade already ran
    # in setup, downgrade runs after) doesn't try to downgrade an
    # already-bare schema.
    command.upgrade(Config(str(ALEMBIC_INI)), "head")


def test_liveness_never_checks_the_database() -> None:
    """A liveness probe must stay `ok` even with an unmigrated/absent
    database - it exists to answer "is the process alive", not "is the
    database up", so an orchestrator doesn't restart a healthy process
    over a transient DB outage."""
    command.downgrade(Config(str(ALEMBIC_INI)), "base")

    response = client.get("/api/v1/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    command.upgrade(Config(str(ALEMBIC_INI)), "head")


def test_readiness_returns_ok_with_a_migrated_database() -> None:
    response = client.get("/api/v1/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["migration_version"] == "0002"


def test_readiness_returns_503_without_a_migrated_database() -> None:
    command.downgrade(Config(str(ALEMBIC_INI)), "base")

    response = client.get("/api/v1/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "error"

    command.upgrade(Config(str(ALEMBIC_INI)), "head")


def test_platform_health_reports_every_subsystem_as_ok_with_real_data() -> None:
    response = client.get("/api/v1/health/platform")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]
    assert body["latency_ms"] >= 0

    names = {check["name"] for check in body["checks"]}
    assert names == {
        "API",
        "Database",
        "Replay Engine",
        "Historical Intelligence",
        "Operational Foresight",
        "Knowledge Graph",
        "Storage",
        "Live Data Connectors",
    }
    assert all(check["status"] == "ok" for check in body["checks"])


def test_platform_health_reports_database_error_without_a_migrated_database() -> None:
    command.downgrade(Config(str(ALEMBIC_INI)), "base")

    response = client.get("/api/v1/health/platform")

    body = response.json()
    assert body["status"] == "error"
    database_check = next(c for c in body["checks"] if c["name"] == "Database")
    assert database_check["status"] == "error"

    command.upgrade(Config(str(ALEMBIC_INI)), "head")
