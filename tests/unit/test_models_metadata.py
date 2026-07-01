"""Confirms every M1 entity is registered on Base.metadata.

This is the one M1 check runnable without a live database - it
catches import errors, __tablename__ typos, or a model that was
written but never imported, none of which ruff/mypy would notice.
"""

from src.infra.db.models import Base

EXPECTED_TABLES = {
    "zones",
    "zone_adjacency",
    "sensors",
    "sensor_readings",
    "permits",
    "workers",
    "equipment",
    "incidents",
    "risk_assessments",
    "audit_log",
}


def test_all_m1_tables_registered() -> None:
    assert set(Base.metadata.tables.keys()) == EXPECTED_TABLES
