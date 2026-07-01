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


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached ``Settings`` singleton."""
    return Settings()
