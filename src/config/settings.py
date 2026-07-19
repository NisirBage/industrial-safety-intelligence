"""Central application settings.

Exists so every layer reads configuration through one typed object
instead of calling ``os.environ`` ad hoc, which the Master Plan (A.2)
explicitly forbids because it creates hidden dependencies and
untestable code paths. ``src/api/main.py`` and ``src/infra/db/session.py``
depend on this module. Only fields an existing milestone's code
actually reads are declared below; each future milestone adds the
fields it needs when it needs them (Redis/Chroma URLs in M7/M11, JWT
secret in M13, Twilio credentials in M10) rather than this file
pre-declaring config for systems that don't exist yet.
"""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    """Typed application settings, populated from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "industrial-safety-intelligence"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/isip"

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        """Fails at startup with a clear message rather than at the
        first query. `database_url` has a default, so a genuinely
        empty environment still starts (against the bundled default
        DB) - this validator exists for the "someone set `DATABASE_URL`
        to something malformed" case (a typo'd scheme, a stray space,
        an un-encoded special character in the password), which
        previously surfaced as an opaque driver-level connection error
        with no indication the DSN itself was the problem."""
        try:
            url = make_url(value)
        except ArgumentError as exc:
            raise ValueError(
                f"DATABASE_URL is not a valid SQLAlchemy connection string: {exc}. "
                "Expected a URL like "
                "postgresql+psycopg://user:password@host:5432/dbname "
                "(percent-encode any special character in the password, e.g. '#' -> '%23')."
            ) from exc
        if not url.drivername.startswith("postgresql"):
            raise ValueError(
                f"DATABASE_URL must use a postgresql driver, got {url.drivername!r}. "
                "This platform's schema (JSONB columns, TimescaleDB-optional hypertables) "
                "is PostgreSQL-specific."
            )
        return value

    # M8's dashboard dev server origins. Vite's default port is 5173,
    # falling to 5174 (or higher) when 5173 is already in use, so both
    # are listed for both localhost/127.0.0.1 forms rather than
    # assuming a single fixed port; 5180 is this project's own
    # launch.json dev-server override and is kept alongside them.
    # Override via env for any other deployment - never widened to "*"
    # here, since the API is served over plain HTTP in development and
    # a wildcard origin would allow any site to read responses from a
    # user's browser.
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5180",
    ]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached ``Settings`` singleton."""
    return Settings()
