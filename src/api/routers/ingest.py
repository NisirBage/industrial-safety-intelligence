"""Live Data Connectors REST router - M27 Part 4.

`POST /ingest/reading` is this app's second-ever write endpoint (after
Scenario Builder's `/validate`/`/execute`) - a real REST ingestion path
that writes through the same `ingest_reading()` every connector uses.
`POST /ingest/mock/{protocol}` triggers one simulated MQTT/OPC-UA
message for a demo. `GET /ingest/status` reports what's real vs
mocked, honestly, with in-process (resets-on-restart) counters -
this app has no persistent connector-process supervisor, so "how many
readings has each connector delivered" only ever means "since this API
process last started."

Deliberately does NOT expose CSV ingestion over HTTP: accepting an
arbitrary server-side file path from a request body would be a real
path-traversal risk in an actual deployment. `csv_watcher.py` remains
a Python-callable utility (invoked by a local script/process with
filesystem access), not a public endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.common.errors import APIError
from src.api.dependencies import get_db_session
from src.api.schemas.ingest import (
    ConnectorStatus,
    ConnectorStatusResponse,
    IngestReadingRequest,
    IngestReadingResponse,
)
from src.infra.db.models.sensor_reading import SensorReading
from src.infra.db.repositories import SensorRepository
from src.live_ingestion.connectors import MockConnectorConfig, MqttConnectorMock, OpcUaConnectorMock
from src.live_ingestion.service import UnknownSensorError, ingest_reading

router = APIRouter(prefix="/ingest", tags=["ingest"])

#: In-process only - resets whenever this API process restarts. No
#: persistent connector supervisor exists to track this across
#: restarts, and this router doesn't invent one.
_INGEST_COUNTS: dict[str, int] = {"rest": 0, "mqtt": 0, "opcua": 0}


def _reading_response(reading: SensorReading) -> IngestReadingResponse:
    return IngestReadingResponse(
        reading_id=str(reading.reading_id),
        sensor_id=str(reading.sensor_id),
        zone_id=str(reading.zone_id),
        gas_type=reading.gas_type,
        value=float(reading.value),
        unit=reading.unit,
        timestamp=reading.timestamp,
        quality_flag=reading.quality_flag,
    )


@router.post(
    "/reading",
    response_model=IngestReadingResponse,
    summary="Ingest one sensor reading via REST",
    description="Writes through the same SensorReadingRepository the simulator already uses. "
    "The deterministic engine picks this reading up on its own next scheduled tick - "
    "this endpoint computes no risk, tier, or confidence itself.",
)
def ingest_reading_endpoint(
    body: IngestReadingRequest, session: Session = Depends(get_db_session)
) -> IngestReadingResponse:
    try:
        sensor_id = uuid.UUID(body.sensor_id)
    except ValueError as exc:
        raise APIError(status_code=400, code="INVALID_SENSOR_ID", message=str(exc)) from exc

    try:
        reading = ingest_reading(
            session,
            sensor_id=sensor_id,
            value=body.value,
            unit=body.unit,
            timestamp=body.timestamp,
            quality_flag=body.quality_flag,
        )
    except UnknownSensorError as exc:
        raise APIError(status_code=404, code="SENSOR_NOT_FOUND", message=str(exc)) from exc

    _INGEST_COUNTS["rest"] += 1
    return _reading_response(reading)


class MockPollRequest(BaseModel):
    zone_id: str
    gas_type: str
    timestamp: datetime


@router.post(
    "/mock/{protocol}",
    response_model=IngestReadingResponse,
    summary="Simulate one inbound message from a mocked MQTT or OPC-UA connector",
    description="protocol is 'mqtt' or 'opcua'. Resolves the zone's real sensor for the given "
    "gas type and generates one deterministic reading (a fixed fraction of that sensor's own "
    "real alarm_threshold) - see connectors.py for why this is a demonstration, not a "
    "production client.",
)
def poll_mock_connector(
    protocol: str, body: MockPollRequest, session: Session = Depends(get_db_session)
) -> IngestReadingResponse:
    if protocol not in ("mqtt", "opcua"):
        raise APIError(
            status_code=400,
            code="UNKNOWN_PROTOCOL",
            message="protocol must be 'mqtt' or 'opcua'.",
        )
    try:
        zone_id = uuid.UUID(body.zone_id)
    except ValueError as exc:
        raise APIError(status_code=400, code="INVALID_ZONE_ID", message=str(exc)) from exc

    sensor = SensorRepository(session).get_by_zone_and_gas(zone_id, body.gas_type)
    if sensor is None:
        raise APIError(
            status_code=404,
            code="SENSOR_NOT_FOUND",
            message=f"No sensor for zone '{zone_id}' monitoring '{body.gas_type}'.",
        )

    connector_cls = MqttConnectorMock if protocol == "mqtt" else OpcUaConnectorMock
    connector = connector_cls(MockConnectorConfig(sensor_id=sensor.sensor_id))
    reading = connector.poll(session, body.timestamp)
    _INGEST_COUNTS[protocol] += 1
    return _reading_response(reading)


@router.get(
    "/status",
    response_model=ConnectorStatusResponse,
    summary="Live Integration Hub connector status",
)
def get_connector_status() -> ConnectorStatusResponse:
    return ConnectorStatusResponse(
        connectors=[
            ConnectorStatus(
                name="CSV Watcher",
                protocol="CSV",
                mode="implemented",
                description="Real, functional - ingests sensor readings from a CSV file. "
                "Invoked as a local script/process (src/live_ingestion/csv_watcher.py), not "
                "exposed over HTTP (accepting a server-side file path from a request would be "
                "a path-traversal risk in a real deployment).",
                readings_ingested_this_process=0,
            ),
            ConnectorStatus(
                name="REST API",
                protocol="HTTP",
                mode="implemented",
                description="Real, functional - POST /ingest/reading.",
                readings_ingested_this_process=_INGEST_COUNTS["rest"],
            ),
            ConnectorStatus(
                name="MQTT Adapter",
                protocol="MQTT",
                mode="mock",
                description="Mocked - simulates one inbound message per poll; does not open a "
                "real broker connection.",
                readings_ingested_this_process=_INGEST_COUNTS["mqtt"],
            ),
            ConnectorStatus(
                name="OPC-UA Connector",
                protocol="OPC-UA",
                mode="mock",
                description="Mocked - simulates one inbound message per poll; does not speak "
                "the real OPC-UA wire protocol.",
                readings_ingested_this_process=_INGEST_COUNTS["opcua"],
            ),
        ]
    )
