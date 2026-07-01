"""Zone adjacency repository.

``adjacent_zone_ids`` is the domain method the Master Plan names by
example: "SIMOPS adjacency check ... using zone_adjacency repository
query" (M4).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.zone_adjacency import ZoneAdjacency


class ZoneAdjacencyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def adjacent_zone_ids(self, zone_id: uuid.UUID) -> list[uuid.UUID]:
        stmt = select(ZoneAdjacency.adjacent_zone_id).where(ZoneAdjacency.zone_id == zone_id)
        return list(self._session.scalars(stmt))

    def create(self, adjacency: ZoneAdjacency) -> ZoneAdjacency:
        merged = self._session.merge(adjacency)
        self._session.flush()
        return merged
