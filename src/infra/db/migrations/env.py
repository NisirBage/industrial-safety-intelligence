"""Alembic environment script.

Exists so ``alembic upgrade head`` (and offline SQL generation via
``--sql``, which needs no live database) knows which metadata to diff
against and which URL to connect with. The URL comes from
``src/config/settings.py`` rather than a second copy hardcoded in
``alembic.ini``, keeping one source of truth for the DSN.
"""

import sys
from logging.config import fileConfig
from pathlib import Path

# The installed `alembic` console script does not add the current
# working directory to sys.path the way `python -m alembic` or pytest
# (via pyproject.toml's pythonpath) do, so a plain `alembic upgrade
# head` run from the repo root fails to import `src.*` without this.
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from alembic import context  # noqa: E402
from sqlalchemy import create_engine, pool  # noqa: E402

from src.config.settings import get_settings  # noqa: E402
from src.infra.db.models import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# The DSN is read directly from `get_settings().database_url` at the
# point each `run_migrations_*` function needs it, and handed straight
# to SQLAlchemy's own `create_engine`/`context.configure(url=...)` -
# the exact same call every other entry point (`session.py`, `seed.py`,
# `simulation_runner.py`, `api/main.py`) already makes. It is
# deliberately never passed through `Config.set_main_option`/
# `get_section`, which route values through a `configparser.ConfigParser`
# that performs `%`-interpolation on every value it stores - silently
# corrupting (or, for an unescaped single `%`, outright rejecting) any
# password containing a literal `%` character (e.g. a URL-encoded
# `#` as `%23`). One DSN, one interpretation, everywhere.


def run_migrations_offline() -> None:
    """Emit migration SQL without a live database connection."""
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = create_engine(get_settings().database_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
