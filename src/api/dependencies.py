"""Shared FastAPI dependencies.

Exists so every router obtains a database session the same way, and
so that way is the existing ``get_session()`` context manager
(``src/infra/db/session.py``) - not a second, API-specific
session-management mechanism. Commit-on-success is harmless for the
read-only endpoints this dependency currently serves (a read-only
transaction has nothing to persist), so no special-casing is needed
here for that.
"""

from collections.abc import Iterator

from sqlalchemy.orm import Session

from src.infra.db.session import get_session


def get_db_session() -> Iterator[Session]:
    with get_session() as session:
        yield session
