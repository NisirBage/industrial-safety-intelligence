"""Seed script - populates a small demo plant from tests/fixtures/demo_plant.json.

Exists so a fresh database can be made runnable with one command
(M1's stated outcome). The JSON fixture is the single source of demo
data; this module only loads it and resolves each human-readable id
(e.g. ``"zone-tank-farm"``) to a deterministic UUID via ``uuid.uuid5``,
so the same fixture id always maps to the same primary key.

Idempotency ("safe to re-run", M1's completion criterion) follows
directly from that determinism plus the repositories' ``merge()``-based
``create()``: re-running this script resolves to the same rows and
updates them in place instead of raising a duplicate-key error.
"""

import json
import uuid
from datetime import date, datetime
from pathlib import Path

from src.infra.db.models.equipment import Equipment
from src.infra.db.models.incident import Incident
from src.infra.db.models.permit import Permit
from src.infra.db.models.sensor import Sensor
from src.infra.db.models.worker import Worker
from src.infra.db.models.zone import Zone
from src.infra.db.models.zone_adjacency import ZoneAdjacency
from src.infra.db.repositories import (
    EquipmentRepository,
    IncidentRepository,
    PermitRepository,
    SensorRepository,
    WorkerRepository,
    ZoneAdjacencyRepository,
    ZoneRepository,
)
from src.infra.db.session import get_session

# Fixed, arbitrary namespace UUID - only its stability matters, not its value.
SEED_NAMESPACE = uuid.UUID("8f14e45f-ceea-4a3d-8b0f-49b1f6a0c1a1")
FIXTURE_PATH = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "demo_plant.json"


def _id(key: str) -> uuid.UUID:
    """Resolve a fixture's human-readable id to a deterministic UUID."""
    return uuid.uuid5(SEED_NAMESPACE, key)


def seed() -> None:
    data = json.loads(FIXTURE_PATH.read_text())

    with get_session() as session:
        zones = ZoneRepository(session)
        for z in data["zones"]:
            zones.create(
                Zone(
                    zone_id=_id(z["id"]),
                    name=z["name"],
                    oisd_area_classification=z["oisd_area_classification"],
                    plant_section=z["plant_section"],
                )
            )

        adjacency = ZoneAdjacencyRepository(session)
        for a in data["zone_adjacency"]:
            adjacency.create(
                ZoneAdjacency(zone_id=_id(a["zone"]), adjacent_zone_id=_id(a["adjacent_zone"]))
            )

        sensors = SensorRepository(session)
        for s in data["sensors"]:
            sensors.create(
                Sensor(
                    sensor_id=_id(s["id"]),
                    zone_id=_id(s["zone"]),
                    gas_type=s["gas_type"],
                    alarm_threshold=s["alarm_threshold"],
                )
            )

        workers = WorkerRepository(session)
        for w in data["workers"]:
            current_zone = w.get("current_zone")
            workers.create(
                Worker(
                    worker_id=_id(w["id"]),
                    role=w["role"],
                    current_zone_id=_id(current_zone) if current_zone else None,
                )
            )

        equipment = EquipmentRepository(session)
        for e in data["equipment"]:
            equipment.create(
                Equipment(
                    equipment_id=_id(e["id"]),
                    zone_id=_id(e["zone"]),
                    equipment_type=e["equipment_type"],
                    isolation_status=e["isolation_status"],
                )
            )

        permits = PermitRepository(session)
        for p in data["permits"]:
            permits.create(
                Permit(
                    permit_id=_id(p["id"]),
                    permit_type=p["permit_type"],
                    zone_id=_id(p["zone"]),
                    issued_at=datetime.fromisoformat(p["issued_at"]),
                    expires_at=datetime.fromisoformat(p["expires_at"]),
                    authorizing_officer_id=_id(p["authorizing_officer"]),
                    # No risk engine exists yet to snapshot from (M5);
                    # a real snapshot lands when the orchestrator does.
                    baseline_snapshot={},
                )
            )

        incidents = IncidentRepository(session)
        for i in data["incidents"]:
            linked_zone = i.get("linked_zone")
            incidents.create(
                Incident(
                    incident_id=_id(i["id"]),
                    source=i["source"],
                    description=i["description"],
                    linked_zone_id=_id(linked_zone) if linked_zone else None,
                    date=date.fromisoformat(i["date"]),
                )
            )


if __name__ == "__main__":
    seed()
