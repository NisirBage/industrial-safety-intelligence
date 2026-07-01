"""Equipment repository."""

import uuid

from sqlalchemy.orm import Session

from src.infra.db.models.equipment import Equipment


class EquipmentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, equipment_id: uuid.UUID) -> Equipment | None:
        return self._session.get(Equipment, equipment_id)

    def create(self, equipment: Equipment) -> Equipment:
        merged = self._session.merge(equipment)
        self._session.flush()
        return merged
