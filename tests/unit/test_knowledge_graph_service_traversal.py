"""Unit tests for GraphService's pure traversal algorithms
(get_subgraph, get_path) - exercised against a fixture graph so no
database is needed. `get_entity`/`get_neighbors` are overridden with
in-memory fixture data; `get_subgraph`/`get_path` themselves are not
touched, so this genuinely tests the same BFS code the real,
DB-backed service uses.
"""

from src.knowledge_graph.entities import GraphEntity
from src.knowledge_graph.relationships import GraphEdge, RelationKind
from src.knowledge_graph.service import GraphService


def _entity(kind: str, entity_id: str) -> GraphEntity:
    return GraphEntity(kind=kind, id=entity_id, label=f"{kind}:{entity_id}")


class FixtureGraphService(GraphService):
    """A GraphService whose entity/neighbor lookups come from an
    in-memory adjacency map instead of a database session."""

    def __init__(
        self, adjacency: dict[tuple[str, str], list[tuple[GraphEdge, GraphEntity]]]
    ) -> None:
        self._adjacency = adjacency
        # Deliberately never calls super().__init__ - no session
        # exists or is needed since both overridden methods below are
        # the only ones this test exercises.

    def get_entity(self, kind: str, entity_id: str) -> GraphEntity | None:
        if (kind, entity_id) in self._adjacency or any(
            (kind, entity_id) == (n.kind, n.id)
            for edges in self._adjacency.values()
            for _, n in edges
        ):
            return _entity(kind, entity_id)
        return None

    def get_neighbors(self, kind: str, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        return self._adjacency.get((kind, entity_id), [])


def _edge(
    source_kind: str, source_id: str, relation: str, target_kind: str, target_id: str
) -> GraphEdge:
    return GraphEdge(source_kind, source_id, relation, target_kind, target_id, f"{relation}")


def test_get_subgraph_expands_one_hop_by_default() -> None:
    adjacency = {
        ("zone", "z1"): [
            (_edge("zone", "z1", RelationKind.CONTAINS, "sensor", "s1"), _entity("sensor", "s1")),
            (_edge("zone", "z1", RelationKind.CONTAINS, "worker", "w1"), _entity("worker", "w1")),
        ],
        ("sensor", "s1"): [
            (
                _edge("sensor", "s1", RelationKind.PRODUCED, "sensor_reading", "r1"),
                _entity("sensor_reading", "r1"),
            ),
        ],
    }
    service = FixtureGraphService(adjacency)

    nodes, edges = service.get_subgraph("zone", "z1", depth=1)

    node_keys = {(n.kind, n.id) for n in nodes}
    assert node_keys == {("zone", "z1"), ("sensor", "s1"), ("worker", "w1")}
    assert len(edges) == 2


def test_get_subgraph_expands_multiple_hops() -> None:
    adjacency = {
        ("zone", "z1"): [
            (_edge("zone", "z1", RelationKind.CONTAINS, "sensor", "s1"), _entity("sensor", "s1")),
        ],
        ("sensor", "s1"): [
            (
                _edge("sensor", "s1", RelationKind.PRODUCED, "sensor_reading", "r1"),
                _entity("sensor_reading", "r1"),
            ),
        ],
    }
    service = FixtureGraphService(adjacency)

    nodes, _edges = service.get_subgraph("zone", "z1", depth=2)

    node_keys = {(n.kind, n.id) for n in nodes}
    assert node_keys == {("zone", "z1"), ("sensor", "s1"), ("sensor_reading", "r1")}


def test_get_subgraph_respects_max_nodes_ceiling() -> None:
    adjacency = {
        ("zone", "z1"): [
            (
                _edge("zone", "z1", RelationKind.CONTAINS, "sensor", f"s{i}"),
                _entity("sensor", f"s{i}"),
            )
            for i in range(10)
        ],
    }
    service = FixtureGraphService(adjacency)

    nodes, _edges = service.get_subgraph("zone", "z1", depth=1, max_nodes=3)

    assert len(nodes) <= 3


def test_get_subgraph_returns_empty_when_root_does_not_exist() -> None:
    service = FixtureGraphService({})
    nodes, edges = service.get_subgraph("zone", "nonexistent", depth=1)
    assert nodes == []
    assert edges == []


def test_get_path_finds_direct_edge() -> None:
    adjacency = {
        ("recommendation", "r1"): [
            (
                _edge("recommendation", "r1", RelationKind.GENERATED, "risk_assessment", "a1"),
                _entity("risk_assessment", "a1"),
            ),
        ],
    }
    service = FixtureGraphService(adjacency)

    path = service.get_path("recommendation", "r1", "risk_assessment", "a1")

    assert path is not None
    assert len(path) == 1
    assert path[0].relation == RelationKind.GENERATED


def test_get_path_finds_multi_hop_chain() -> None:
    # recommendation -> risk_assessment -> triggered_agent -> sensor,
    # mirroring the "Why?" chain Part 7 describes.
    adjacency = {
        ("recommendation", "r1"): [
            (
                _edge("recommendation", "r1", RelationKind.GENERATED, "risk_assessment", "a1"),
                _entity("risk_assessment", "a1"),
            ),
        ],
        ("risk_assessment", "a1"): [
            (
                _edge(
                    "risk_assessment",
                    "a1",
                    RelationKind.TRIGGERED,
                    "triggered_agent",
                    "a1|gas_risk",
                ),
                _entity("triggered_agent", "a1|gas_risk"),
            ),
        ],
        ("triggered_agent", "a1|gas_risk"): [
            (
                _edge("triggered_agent", "a1|gas_risk", RelationKind.EVIDENCE, "sensor", "s1"),
                _entity("sensor", "s1"),
            ),
        ],
    }
    service = FixtureGraphService(adjacency)

    path = service.get_path("recommendation", "r1", "sensor", "s1")

    assert path is not None
    assert [edge.relation for edge in path] == [
        RelationKind.GENERATED,
        RelationKind.TRIGGERED,
        RelationKind.EVIDENCE,
    ]


def test_get_path_returns_none_when_unreachable() -> None:
    adjacency = {("zone", "z1"): []}
    service = FixtureGraphService(adjacency)
    assert service.get_path("zone", "z1", "sensor", "s99") is None


def test_get_path_returns_empty_list_when_source_equals_target() -> None:
    service = FixtureGraphService({})
    assert service.get_path("zone", "z1", "zone", "z1") == []


def test_get_path_respects_max_depth() -> None:
    # A chain of 3 hops, but max_depth=1 should fail to find it.
    adjacency = {
        ("a", "1"): [(_edge("a", "1", RelationKind.CONTAINS, "b", "2"), _entity("b", "2"))],
        ("b", "2"): [(_edge("b", "2", RelationKind.CONTAINS, "c", "3"), _entity("c", "3"))],
        ("c", "3"): [(_edge("c", "3", RelationKind.CONTAINS, "d", "4"), _entity("d", "4"))],
    }
    service = FixtureGraphService(adjacency)

    assert service.get_path("a", "1", "d", "4", max_depth=1) is None
    assert service.get_path("a", "1", "d", "4", max_depth=3) is not None
