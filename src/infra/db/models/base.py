"""Shared declarative base for every ORM model.

Exists so all ten models register onto one ``MetaData`` object, which
Alembic's ``env.py`` needs as ``target_metadata`` and which
``tests/unit/test_models_metadata.py`` inspects to confirm every
table was actually defined.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
