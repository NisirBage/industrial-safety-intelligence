"""Response shapes for the Enterprise Health Dashboard (M27 Part 6).
Every field reports the real, current state of an already-existing
subsystem (database, scenario catalog, historical decks, knowledge
graph vocabulary, live-ingestion connectors) - this module computes
no risk, tier, or confidence itself."""

from pydantic import BaseModel


class SubsystemCheck(BaseModel):
    name: str
    status: str
    detail: str


class PlatformHealthResponse(BaseModel):
    status: str
    version: str
    latency_ms: float
    checks: list[SubsystemCheck]
