"""Typed repositories - the only modules allowed to touch SQLAlchemy sessions directly.

``AuditLogRepository`` (M6) is read-only: M6 was scoped to the REST
API only for this pass, so the audit log's write logic (including
hash chaining) remains deferred to a future milestone - see that
repository's own docstring.
"""

from src.infra.db.repositories.audit_log_repository import AuditLogRepository
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
    "AuditLogRepository",
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
