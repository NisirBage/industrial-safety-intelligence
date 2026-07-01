"""SQLAlchemy engine and session factory.

Exists so the repositories package (and, later, the seed script and
any milestone that reads or writes the database) obtain sessions from
one place rather than constructing engines themselves - this is what
lets "no other package imports SQLAlchemy session objects directly"
(M1 Task 3's outcome) hold in practice.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.config.settings import get_settings

engine = create_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def get_session() -> Iterator[Session]:
    """Yield a session, committing on success and rolling back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
