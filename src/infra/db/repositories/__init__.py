"""Typed repositories - the only modules allowed to touch SQLAlchemy sessions directly.

No ``audit_repository.py`` here yet: M6 owns the audit log's write
logic (including hash chaining) and gets to design that repository
against real requirements, not one guessed at in M1.
"""

from src.infra.db.repositories.equipment_repository import EquipmentRepository
from src.infra.db.repositories.incident_repository import IncidentRepository
from src.infra.db.repositories.permit_repository import PermitRepository
from src.infra.db.repositories.risk_assessment_repository import RiskAssessmentRepository
from src.infra.db.repositories.sensor_reading_repository import SensorReadingRepository
from src.infra.db.repositories.sensor_repository import SensorRepository
from src.infra.db.repositories.worker_repository import WorkerRepository
from src.infra.db.repositories.zone_adjacency_repository import ZoneAdjacencyRepository
from src.infra.db.repositories.zone_repository import ZoneRepository

__all__ = [
    "EquipmentRepository",
    "IncidentRepository",
    "PermitRepository",
    "RiskAssessmentRepository",
    "SensorReadingRepository",
    "SensorRepository",
    "WorkerRepository",
    "ZoneAdjacencyRepository",
    "ZoneRepository",
]
