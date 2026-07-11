"""Operational Knowledge Graph REST router - M26.

Every endpoint here is additive and read-only: entity lookup,
neighborhood expansion, bounded subgraph generation, search, and
shortest-path. No mutation endpoint exists anywhere in this router.
Every response is assembled by `GraphService` from data that already
exists elsewhere in this platform (real database rows, real
historical incidents, real forecasts, the real unmodified
counterfactual comparator) - this router computes nothing itself.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.api.common.errors import APIError, ErrorResponse
from src.api.dependencies import get_db_session
from src.api.schemas.graph import (
    GraphEdgeResponse,
    GraphEntityResponse,
    NeighborResponse,
    NeighborsResponse,
    PathResponse,
    SearchResponse,
    SubgraphResponse,
)
from src.knowledge_graph.entities import EntityKind, GraphEntity
from src.knowledge_graph.relationships import GraphEdge
from src.knowledge_graph.service import GraphService

router = APIRouter(prefix="/graph", tags=["graph"])

_MAX_DEPTH = 4
_MAX_NODES_CEILING = 150
_MAX_SEARCH_LIMIT = 50
_MAX_PATH_DEPTH = 8


def _entity_response(entity: GraphEntity) -> GraphEntityResponse:
    return GraphEntityResponse(
        kind=entity.kind, id=entity.id, label=entity.label, attributes=dict(entity.attributes)
    )


def _edge_response(edge: GraphEdge) -> GraphEdgeResponse:
    return GraphEdgeResponse(
        source_kind=edge.source_kind,
        source_id=edge.source_id,
        relation=edge.relation,
        target_kind=edge.target_kind,
        target_id=edge.target_id,
        label=edge.label,
    )


def _require_valid_kind(kind: str) -> None:
    if kind not in EntityKind.ALL:
        raise APIError(
            status_code=400,
            code="INVALID_ENTITY_KIND",
            message=f"'{kind}' is not one of the graph's {len(EntityKind.ALL)} entity kinds.",
        )


@router.get(
    "/entity/{kind}/{entity_id}",
    response_model=GraphEntityResponse,
    summary="Look up a single graph entity by kind and id",
    responses={404: {"model": ErrorResponse}},
)
def get_entity(
    kind: str, entity_id: str, session: Session = Depends(get_db_session)
) -> GraphEntityResponse:
    _require_valid_kind(kind)
    entity = GraphService(session).get_entity(kind, entity_id)
    if entity is None:
        raise APIError(
            status_code=404,
            code="ENTITY_NOT_FOUND",
            message=f"No {kind} entity with id '{entity_id}'.",
        )
    return _entity_response(entity)


@router.get(
    "/neighbors/{kind}/{entity_id}",
    response_model=NeighborsResponse,
    summary="One-hop neighborhood of a graph entity",
    description="Lazy-loaded - never the whole graph. Every neighbor edge is real "
    "and documented in src/knowledge_graph/relationships.py::RELATIONSHIP_CATALOG.",
    responses={404: {"model": ErrorResponse}},
)
def get_neighbors(
    kind: str, entity_id: str, session: Session = Depends(get_db_session)
) -> NeighborsResponse:
    _require_valid_kind(kind)
    service = GraphService(session)
    entity = service.get_entity(kind, entity_id)
    if entity is None:
        raise APIError(
            status_code=404,
            code="ENTITY_NOT_FOUND",
            message=f"No {kind} entity with id '{entity_id}'.",
        )
    neighbors = service.get_neighbors(kind, entity_id)
    return NeighborsResponse(
        entity=_entity_response(entity),
        neighbors=[
            NeighborResponse(edge=_edge_response(edge), entity=_entity_response(neighbor))
            for edge, neighbor in neighbors
        ],
    )


@router.get(
    "/subgraph/{kind}/{entity_id}",
    response_model=SubgraphResponse,
    summary="Bounded multi-hop subgraph around an entity",
    description="Breadth-first expansion capped by both `depth` and `max_nodes` - "
    "never materializes the entire graph (Part 14 performance discipline).",
    responses={404: {"model": ErrorResponse}},
)
def get_subgraph(
    kind: str,
    entity_id: str,
    depth: int = Query(default=1, ge=1, le=_MAX_DEPTH),
    max_nodes: int = Query(default=60, ge=1, le=_MAX_NODES_CEILING),
    session: Session = Depends(get_db_session),
) -> SubgraphResponse:
    _require_valid_kind(kind)
    service = GraphService(session)
    if service.get_entity(kind, entity_id) is None:
        raise APIError(
            status_code=404,
            code="ENTITY_NOT_FOUND",
            message=f"No {kind} entity with id '{entity_id}'.",
        )
    nodes, edges = service.get_subgraph(kind, entity_id, depth=depth, max_nodes=max_nodes)
    return SubgraphResponse(
        nodes=[_entity_response(node) for node in nodes],
        edges=[_edge_response(edge) for edge in edges],
    )


@router.get(
    "/search",
    response_model=SearchResponse,
    summary="Substring search across queryable graph entities",
    description="Zones, sensors, workers, equipment, and historical incidents only - "
    "per-tick entities (RiskAssessment, TriggeredAgent, Recommendation, Forecast, "
    "Counterfactual, BusinessImpact) are reached by navigation, not search, so this "
    "endpoint never scans unbounded history.",
)
def search_entities(
    q: str,
    limit: int = Query(default=20, ge=1, le=_MAX_SEARCH_LIMIT),
    session: Session = Depends(get_db_session),
) -> SearchResponse:
    results = GraphService(session).search(q, limit=limit)
    return SearchResponse(query=q, results=[_entity_response(entity) for entity in results])


@router.get(
    "/path",
    response_model=PathResponse,
    summary="Shortest deterministic path between two entities - the 'why' chain",
    description="Breadth-first search over real edges only, capped at max_depth hops. "
    "found=false (not an error) when no path exists within that bound.",
)
def get_path(
    source_kind: str,
    source_id: str,
    target_kind: str,
    target_id: str,
    max_depth: int = Query(default=6, ge=1, le=_MAX_PATH_DEPTH),
    session: Session = Depends(get_db_session),
) -> PathResponse:
    _require_valid_kind(source_kind)
    _require_valid_kind(target_kind)
    path = GraphService(session).get_path(
        source_kind, source_id, target_kind, target_id, max_depth=max_depth
    )
    if path is None:
        return PathResponse(found=False, edges=[])
    return PathResponse(found=True, edges=[_edge_response(edge) for edge in path])
