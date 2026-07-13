"""Request/response schemas for the Live Data Connectors API (M27 Part 4)."""

from datetime import datetime

from pydantic import BaseModel


class IngestReadingRequest(BaseModel):
    sensor_id: str
    value: float
    unit: str
    timestamp: datetime
    quality_flag: str = "ok"


class IngestReadingResponse(BaseModel):
    reading_id: str
    sensor_id: str
    zone_id: str
    gas_type: str
    value: float
    unit: str
    timestamp: datetime
    quality_flag: str


class ConnectorStatus(BaseModel):
    name: str
    protocol: str
    mode: str  # "implemented" | "mock"
    description: str
    readings_ingested_this_process: int


class ConnectorStatusResponse(BaseModel):
    connectors: list[ConnectorStatus]
