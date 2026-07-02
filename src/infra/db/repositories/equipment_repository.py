"""Equipment repository.

``list_by_zone`` is the System Integration Layer's addition (Phase 0,
Context Builder Design): the Equipment Status Context Builder needs
every equipment record in a zone, and no zone-scoped query existed
before this.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.infra.db.models.equipment import Equipment


class EquipmentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, equipment_id: uuid.UUID) -> Equipment | None:
        return self._session.get(Equipment, equipment_id)

    def list_by_zone(self, zone_id: uuid.UUID) -> list[Equipment]:
        stmt = select(Equipment).where(Equipment.zone_id == zone_id)
        return list(self._session.scalars(stmt).all())

    def create(self, equipment: Equipment) -> Equipment:
        merged = self._session.merge(equipment)
        self._session.flush()
        return merged
