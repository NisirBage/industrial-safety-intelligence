"""Central application settings.

Exists so every layer reads configuration through one typed object
instead of calling ``os.environ`` ad hoc, which the Master Plan (A.2)
explicitly forbids because it creates hidden dependencies and
untestable code paths. ``src/api/main.py`` depends on this module.
Only the field M0's own code actually reads (``app_name``) is
declared below; each future milestone adds the fields it needs when
it needs them (DB DSN in M1, Redis/Chroma URLs in M7/M11, JWT secret
in M13, Twilio credentials in M10) rather than this file pre-declaring
config for systems that don't exist yet.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings, populated from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "industrial-safety-intelligence"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached ``Settings`` singleton."""
    return Settings()
