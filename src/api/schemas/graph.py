"""Request/response schemas for the Operational Knowledge Graph API
(M26). Every field reshapes a `src/knowledge_graph/*` dataclass
exactly - nothing here is a new computation, only a response shape.
All endpoints are additive and read-only; no mutation endpoint exists
anywhere in this router.
"""

from typing import Any

from pydantic import BaseModel


class GraphEntityResponse(BaseModel):
    kind: str
    id: str
    label: str
    attributes: dict[str, Any]


class GraphEdgeResponse(BaseModel):
    source_kind: str
    source_id: str
    relation: str
    target_kind: str
    target_id: str
    label: str


class NeighborResponse(BaseModel):
    edge: GraphEdgeResponse
    entity: GraphEntityResponse


class NeighborsResponse(BaseModel):
    entity: GraphEntityResponse
    neighbors: list[NeighborResponse]


class SubgraphResponse(BaseModel):
    nodes: list[GraphEntityResponse]
    edges: list[GraphEdgeResponse]


class SearchResponse(BaseModel):
    query: str
    results: list[GraphEntityResponse]


class PathResponse(BaseModel):
    found: bool
    edges: list[GraphEdgeResponse]
