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

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings, populated from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "industrial-safety-intelligence"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/isip"
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
