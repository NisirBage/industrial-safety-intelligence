import { apiGet } from "./client";
import type { GraphEntity, GraphNeighbors, GraphPath, GraphSearchResult, GraphSubgraph } from "./types";

/** GET /api/v1/graph/entity/{kind}/{id} - a single node, looked up by
 * its real kind+id. */
export function getGraphEntity(kind: string, id: string): Promise<GraphEntity> {
  return apiGet<GraphEntity>(`/api/v1/graph/entity/${kind}/${id}`);
}

/** GET /api/v1/graph/neighbors/{kind}/{id} - one-hop neighborhood,
 * lazy-loaded (never the whole graph). */
export function getGraphNeighbors(kind: string, id: string): Promise<GraphNeighbors> {
  return apiGet<GraphNeighbors>(`/api/v1/graph/neighbors/${kind}/${id}`);
}

/** GET /api/v1/graph/subgraph/{kind}/{id} - bounded multi-hop
 * expansion, capped by both depth and max_nodes server-side. */
export function getGraphSubgraph(
  kind: string,
  id: string,
  options: { depth?: number; maxNodes?: number } = {},
): Promise<GraphSubgraph> {
  return apiGet<GraphSubgraph>(`/api/v1/graph/subgraph/${kind}/${id}`, {
    depth: options.depth,
    max_nodes: options.maxNodes,
  });
}

/** GET /api/v1/graph/search - substring search across queryable
 * entity kinds (zones, sensors, workers, equipment, historical
 * incidents). */
export function searchGraphEntities(query: string, limit?: number): Promise<GraphSearchResult> {
  return apiGet<GraphSearchResult>("/api/v1/graph/search", { q: query, limit });
}

/** GET /api/v1/graph/path - the deterministic "why" chain between two
 * entities. `found: false` means no path exists within max_depth, not
 * an error. */
export function getGraphPath(
  source: { kind: string; id: string },
  target: { kind: string; id: string },
  maxDepth?: number,
): Promise<GraphPath> {
  return apiGet<GraphPath>("/api/v1/graph/path", {
    source_kind: source.kind,
    source_id: source.id,
    target_kind: target.kind,
    target_id: target.id,
    max_depth: maxDepth,
  });
}
