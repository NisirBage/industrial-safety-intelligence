"""Compute-only performance benchmark for the Operational Knowledge
Graph (M26 Part 14).

Same constraint as ``benchmark_deterministic_engine.py``: this sandbox
has no live PostgreSQL, so ``GraphService``'s real, DB-backed
``get_entity``/``get_neighbors`` methods cannot be measured end-to-end.
This script instead measures the part that is architecture, not I/O:
the bounded BFS traversal in ``get_subgraph``/``get_path`` themselves,
against an in-memory fixture adjacency (the same ``FixtureGraphService``
pattern ``tests/unit/test_knowledge_graph_service_traversal.py`` uses).
It answers the one question that matters for Part 14 ("never render
the whole graph"): does traversal cost stay bounded as the underlying
graph grows, given the `max_nodes` ceiling never changes?

Not a pytest test - a measurement script. Prints numbers for the M26
final report to record.

Run: python scripts/benchmark_knowledge_graph.py
"""

import time

from src.knowledge_graph.entities import GraphEntity
from src.knowledge_graph.relationships import GraphEdge, RelationKind
from src.knowledge_graph.service import GraphService

_MAX_SUBGRAPH_NODES = 60


def _entity(kind: str, entity_id: str) -> GraphEntity:
    return GraphEntity(kind=kind, id=entity_id, label=f"{kind}:{entity_id}")


def _edge(source_kind: str, source_id: str, target_kind: str, target_id: str) -> GraphEdge:
    return GraphEdge(
        source_kind, source_id, RelationKind.CONTAINS, target_kind, target_id, "contains"
    )


class FixtureGraphService(GraphService):
    """Mirrors the test suite's fixture harness - no session, no DB."""

    def __init__(
        self, adjacency: dict[tuple[str, str], list[tuple[GraphEdge, GraphEntity]]]
    ) -> None:
        self._adjacency = adjacency

    def get_entity(self, kind: str, entity_id: str) -> GraphEntity | None:
        if (kind, entity_id) in self._adjacency:
            return _entity(kind, entity_id)
        return None

    def get_neighbors(self, kind: str, entity_id: str) -> list[tuple[GraphEdge, GraphEntity]]:
        return self._adjacency.get((kind, entity_id), [])


def _build_dense_zone_fixture(
    fan_out: int, depth: int
) -> dict[tuple[str, str], list[tuple[GraphEdge, GraphEntity]]]:
    """A `fan_out`-ary tree `depth` levels deep, rooted at ("zone", "z0")
    - simulates a plant with many zones, each with many sensors/workers/
    equipment, several hops out from the root."""
    adjacency: dict[tuple[str, str], list[tuple[GraphEdge, GraphEntity]]] = {}
    frontier = [("zone", "z0")]
    for level in range(depth):
        next_frontier = []
        for kind, entity_id in frontier:
            children = []
            for i in range(fan_out):
                child_kind = "sensor" if level % 2 == 0 else "zone"
                child_id = f"{entity_id}_{i}"
                children.append(
                    (_edge(kind, entity_id, child_kind, child_id), _entity(child_kind, child_id))
                )
                next_frontier.append((child_kind, child_id))
            adjacency[(kind, entity_id)] = children
        frontier = next_frontier
    return adjacency


def benchmark_subgraph(fan_out: int, depth: int, requested_depth: int) -> tuple[float, int]:
    adjacency = _build_dense_zone_fixture(fan_out, depth)
    service = FixtureGraphService(adjacency)
    start = time.perf_counter()
    nodes, _edges = service.get_subgraph("zone", "z0", depth=requested_depth)
    elapsed = time.perf_counter() - start
    return elapsed, len(nodes)


def benchmark_path(fan_out: int, depth: int) -> tuple[float, bool]:
    adjacency = _build_dense_zone_fixture(fan_out, depth)
    service = FixtureGraphService(adjacency)
    # Deepest node reachable at this fan-out/depth combination.
    target_kind = "sensor" if (depth - 1) % 2 == 0 else "zone"
    target_id = "z0_" + "_".join(["0"] * depth)
    start = time.perf_counter()
    path = service.get_path("zone", "z0", target_kind, target_id, max_depth=depth + 1)
    elapsed = time.perf_counter() - start
    return elapsed, path is not None


def main() -> None:
    print("=== Operational Knowledge Graph traversal benchmark (compute-only) ===")
    print("(No database in this sandbox - real GraphService.get_neighbors calls")
    print(" real repositories; only the BFS algorithm itself is measured here.)")
    print()

    for fan_out, depth in [(3, 2), (5, 3), (8, 3)]:
        total_nodes = sum(fan_out**i for i in range(depth + 1))
        elapsed, returned = benchmark_subgraph(fan_out, depth, requested_depth=1)
        print(
            f"get_subgraph depth=1, fixture has {total_nodes:>4} reachable nodes: "
            f"{elapsed * 1000:.3f} ms, {returned} nodes returned "
            f"(bounded by max_nodes={_MAX_SUBGRAPH_NODES})"
        )

    print()
    for fan_out, depth in [(2, 4), (3, 4)]:
        elapsed, found = benchmark_path(fan_out, depth)
        print(
            f"get_path, {depth}-hop chain, fan_out={fan_out}: "
            f"{elapsed * 1000:.3f} ms, found={found}"
        )

    print()
    adjacency = _build_dense_zone_fixture(fan_out=3, depth=8)
    service = FixtureGraphService(adjacency)
    start = time.perf_counter()
    path = service.get_path("zone", "z0", "sensor", "does_not_exist", max_depth=3)
    elapsed = time.perf_counter() - start
    print(
        f"get_path, unreachable target within max_depth=3 (8-level fixture): "
        f"{elapsed * 1000:.3f} ms, found={path is not None}"
    )


if __name__ == "__main__":
    main()
