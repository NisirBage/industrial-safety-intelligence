"""Integration tests for M1's schema and constraints.

Requires a live Postgres/Timescale instance reachable at
``DATABASE_URL`` (the ``db`` service in deploy/docker-compose.yml, or
the CI service block in .github/workflows/ci.yml) - not runnable in
an environment without Docker. See the M1 Engineering Report for what
remains unverified in the sandbox that authored this file.

Each test runs the real Alembic migration (not
``Base.metadata.create_all()``) so a drift between the migration file
and the models would actually be caught here.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError

from src.infra.db.models.audit_log import AuditLog
from src.infra.db.models.zone import Zone
from src.infra.db.repositories.zone_repository import ZoneRepository
from src.infra.db.seed import seed
from src.infra.db.session import get_session

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


@pytest.fixture(autouse=True)
def _migrated_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


def test_alembic_upgrade_head_builds_a_usable_schema() -> None:
    with get_session() as session:
        zone = ZoneRepository(session).create(Zone(name="Test Zone", plant_section="Test"))
        assert ZoneRepository(session).get(zone.zone_id) is not None


def test_on_delete_restrict_blocks_zone_deletion_with_audit_log_entries() -> None:
    with get_session() as session:
        zone = ZoneRepository(session).create(Zone(name="Restricted Zone", plant_section="Test"))
        session.add(
            AuditLog(event_type="risk_computed", actor="system", zone_id=zone.zone_id, payload={})
        )

    with pytest.raises(IntegrityError):
        with get_session() as session:
            session.delete(session.get(Zone, zone.zone_id))


def test_seed_script_is_idempotent() -> None:
    seed()
    seed()
