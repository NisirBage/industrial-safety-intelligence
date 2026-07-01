"""Zone repository.

Exists so callers never touch the ``zones`` table via a raw
SQLAlchemy session directly (M1 Task 3's isolation requirement).
"""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.zone import Zone


class ZoneRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, zone_id: uuid.UUID) -> Zone | None:
        return self._session.get(Zone, zone_id)

    def create(self, zone: Zone) -> Zone:
        """Insert, or update in place if ``zone.zone_id`` already exists.

        Uses ``merge()`` rather than ``add()`` so callers like
        ``seed.py`` can be idempotent by construction - see
        docs/schema_decisions.md.
        """
        merged = self._session.merge(zone)
        self._session.flush()
        return merged
