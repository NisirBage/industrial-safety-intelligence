"""Integration test for PermitRepository.update_status() (M4B).

Requires a live Postgres/Timescale instance, same category as
tests/integration/test_db_constraints.py - not runnable in an
environment without Docker.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from src.domain.simulation.ids import resolve_id
from src.infra.db.repositories.permit_repository import PermitRepository
from src.infra.db.seed import seed
from src.infra.db.session import get_session

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


@pytest.fixture(autouse=True)
def _migrated_and_seeded_schema() -> Iterator[None]:
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")
    seed()
    yield
    command.downgrade(cfg, "base")


def test_update_status_changes_only_status_and_preserves_baseline() -> None:
    permit_id = resolve_id("permit-hotwork-1")

    with get_session() as session:
        repo = PermitRepository(session)
        before = repo.get(permit_id)
        assert before is not None
        original_baseline = before.baseline_snapshot
        original_permit_type = before.permit_type

        updated = repo.update_status(permit_id, "flagged")
        assert updated.status == "flagged"
        assert updated.baseline_snapshot == original_baseline
        assert updated.permit_type == original_permit_type

    with get_session() as session:
        reloaded = PermitRepository(session).get(permit_id)
        assert reloaded is not None
        assert reloaded.status == "flagged"
        assert reloaded.baseline_snapshot == original_baseline


def test_update_status_raises_for_unknown_permit() -> None:
    with get_session() as session:
        repo = PermitRepository(session)
        with pytest.raises(ValueError, match="no permit found"):
            repo.update_status(resolve_id("permit-does-not-exist"), "flagged")
