"""Zone repository.

Exists so callers never touch the ``zones`` table via a raw
SQLAlchemy session directly (M1 Task 3's isolation requirement).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.zone import Zone


class ZoneRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, zone_id: uuid.UUID) -> Zone | None:
        return self._session.get(Zone, zone_id)

    def list_all(self) -> list[Zone]:
        """Every zone, ordered by name - the Decision Intelligence
        Layer's addition (``GET /zones``): the first read path this
        project has ever needed for zone *metadata* rather than a
        zone_id looked up as a foreign key elsewhere. Plain read, no
        business logic."""
        stmt = select(Zone).order_by(Zone.name)
        return list(self._session.scalars(stmt).all())

    def create(self, zone: Zone) -> Zone:
        """Insert, or update in place if ``zone.zone_id`` already exists.

        Uses ``merge()`` rather than ``add()`` so callers like
        ``seed.py`` can be idempotent by construction - see
        docs/schema_decisions.md.
        """
        merged = self._session.merge(zone)
        self._session.flush()
        return merged
