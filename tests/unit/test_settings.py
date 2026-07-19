"""Production-deployment audit: `Settings` must fail fast on a
malformed `DATABASE_URL` rather than starting up successfully and only
failing at the first query - a clear startup error is much easier for
a judge/operator to diagnose than an opaque driver-level connection
failure minutes into a demo."""

import pytest

from src.config.settings import Settings


def test_accepts_the_default_database_url() -> None:
    settings = Settings(database_url="postgresql+psycopg://postgres:postgres@localhost:5432/isip")
    assert settings.database_url == "postgresql+psycopg://postgres:postgres@localhost:5432/isip"


def test_accepts_a_percent_encoded_password() -> None:
    settings = Settings(database_url="postgresql+psycopg://postgres:my%23pass@localhost:5432/isip")
    assert "my%23pass" in settings.database_url


def test_rejects_a_malformed_url() -> None:
    with pytest.raises(ValueError, match="not a valid SQLAlchemy connection string"):
        Settings(database_url="not a url at all")


def test_rejects_a_non_postgresql_driver() -> None:
    with pytest.raises(ValueError, match="must use a postgresql driver"):
        Settings(database_url="sqlite:///local.db")
