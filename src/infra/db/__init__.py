"""SQLAlchemy models, Alembic migrations, and repositories.

Populated in M1: ten models under ``models/``, a hand-authored initial
migration under ``migrations/``, typed repositories under
``repositories/`` (everything except ``audit_log``, which M6 owns),
a session factory in ``session.py``, and a seed script in
``seed.py``. See docs/data_model.md and docs/schema_decisions.md.
"""
