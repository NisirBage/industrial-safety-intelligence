"""Zones REST router - ``GET /zones`` (Decision Intelligence Layer).

Orchestrates only: calls ``ZoneRepository.list_all()``, shapes the
response. No risk computation, no business logic - zones are static
plant metadata, not a deterministic-engine output.

``/{zone_id}/sensors`` and ``/{zone_id}/equipment`` (Scenario Builder)
are the same pattern: reuse an already-existing repository method
(``SensorRepository.list_by_zone``, ``EquipmentRepository.list_by_zone``,
both predate this router) and shape the response - no new query logic.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.dependencies import get_db_session
from src.api.schemas.equipment import EquipmentResponse
from src.api.schemas.sensors import SensorResponse
from src.api.schemas.zones import ZoneResponse, ZoneWorkerCountResponse
from src.infra.db.repositories import (
    EquipmentRepository,
    SensorRepository,
    WorkerRepository,
    ZoneRepository,
)

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get(
    "",
    response_model=list[ZoneResponse],
    summary="List every zone with its human-readable name",
    description="Plant metadata only - never a risk value. Added so the frontend can show "
    "real zone names instead of truncated UUIDs.",
)
def list_zones(session: Session = Depends(get_db_session)) -> list[ZoneResponse]:
    rows = ZoneRepository(session).list_all()
    return [ZoneResponse.model_validate(row) for row in rows]


@router.get(
    "/{zone_id}/workers/count",
    response_model=ZoneWorkerCountResponse,
    summary="Current worker headcount for one zone",
    description="Raw headcount, not a risk value - `len(WorkerRepository.list_by_current_zone("
    "zone_id))`. An unknown zone_id returns 0, matching this API's existing convention for "
    "zone-scoped reads.",
)
def get_zone_worker_count(
    zone_id: uuid.UUID, session: Session = Depends(get_db_session)
) -> ZoneWorkerCountResponse:
    workers = WorkerRepository(session).list_by_current_zone(zone_id)
    return ZoneWorkerCountResponse(zone_id=zone_id, worker_count=len(workers))


@router.get(
    "/{zone_id}/sensors",
    response_model=list[SensorResponse],
    summary="Every sensor monitoring one zone",
    description="Plant metadata only. Lets the Scenario Builder show which gas type(s) a "
    "zone actually monitors before a user authors a sensor event against it - an "
    "unknown zone_id returns an empty list, matching this API's zone-scoped read convention.",
)
def list_zone_sensors(
    zone_id: uuid.UUID, session: Session = Depends(get_db_session)
) -> list[SensorResponse]:
    rows = SensorRepository(session).list_by_zone(zone_id)
    return [SensorResponse.model_validate(row) for row in rows]


@router.get(
    "/{zone_id}/equipment",
    response_model=list[EquipmentResponse],
    summary="Every equipment record in one zone",
    description="Read-only plant metadata for the Scenario Builder's equipment browser - "
    "equipment has no scenario-event concept (the frozen Scenario schema doesn't define "
    "one), so this is informational context only, never something a scenario execution "
    "writes to.",
)
def list_zone_equipment(
    zone_id: uuid.UUID, session: Session = Depends(get_db_session)
) -> list[EquipmentResponse]:
    rows = EquipmentRepository(session).list_by_zone(zone_id)
    return [EquipmentResponse.model_validate(row) for row in rows]
