"""Imports every model so they all register on ``Base.metadata``.

Alembic's ``env.py`` imports this package to build ``target_metadata``;
``tests/unit/test_models_metadata.py`` imports it to verify all ten
tables are registered. Importing a model module for its side effect
(registering on ``Base.metadata``) only works if something imports
every module - this file is that something.
"""

from src.infra.db.models.audit_log import AuditLog
from src.infra.db.models.base import Base
from src.infra.db.models.equipment import Equipment
from src.infra.db.models.incident import Incident
from src.infra.db.models.permit import Permit
from src.infra.db.models.risk_assessment import RiskAssessment
from src.infra.db.models.sensor import Sensor
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.models.worker import Worker
from src.infra.db.models.zone import Zone
from src.infra.db.models.zone_adjacency import ZoneAdjacency

__all__ = [
    "AuditLog",
    "Base",
    "Equipment",
    "Incident",
    "Permit",
    "RiskAssessment",
    "Sensor",
    "SensorReading",
    "Worker",
    "Zone",
    "ZoneAdjacency",
]
