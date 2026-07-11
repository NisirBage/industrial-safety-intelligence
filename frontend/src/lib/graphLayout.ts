import type { GraphEdge, GraphEntity } from "../api/types";

export interface LaidOutNode {
  key: string;
  entity: GraphEntity;
  x: number;
  y: number;
}

export function nodeKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** The one place that builds a GraphEdge's canvas edge id - shared by
 * GraphCanvas (rendering) and Judge Mode (highlighting), so an id
 * built here always matches a rendered edge. */
export function edgeKey(edge: GraphEdge): string {
  const source = nodeKey(edge.source_kind, edge.source_id);
  const target = nodeKey(edge.target_kind, edge.target_id);
  return `${source}->${target}:${edge.relation}`;
}

/**
 * M26 Part 5/14 (Graph visualization, Performance) - a deterministic
 * radial layout: concentric rings by BFS distance from the root,
 * nodes evenly spaced within each ring. Deliberately not a
 * force-directed simulation - no physics, no randomness, no
 * iterative settling - so the same input always produces the exact
 * same layout, and a page reload never "jumps." Professional and
 * industrial, not flashy, per this milestone's own instruction.
 */
export function layoutRadial(
  rootKey: string,
  nodes: GraphEntity[],
  edges: GraphEdge[],
  options: { ringSpacing?: number } = {},
): LaidOutNode[] {
  const ringSpacing = options.ringSpacing ?? 220;
  const byKey = new Map(nodes.map((node) => [nodeKey(node.kind, node.id), node]));
  if (!byKey.has(rootKey)) {
    return [];
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(nodeKey(node.kind, node.id), new Set());
  }
  for (const edge of edges) {
    const source = nodeKey(edge.source_kind, edge.source_id);
    const target = nodeKey(edge.target_kind, edge.target_id);
    if (adjacency.has(source) && adjacency.has(target)) {
      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);
    }
  }

  const distance = new Map<string, number>([[rootKey, 0]]);
  const queue: string[] = [rootKey];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentDistance = distance.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!distance.has(neighbor)) {
        distance.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    }
  }

  const ringMembers = new Map<number, string[]>();
  for (const [key, ring] of distance) {
    const members = ringMembers.get(ring) ?? [];
    members.push(key);
    ringMembers.set(ring, members);
  }

  const laidOut: LaidOutNode[] = [];
  for (const [ring, members] of ringMembers) {
    const sorted = [...members].sort();
    sorted.forEach((key, index) => {
      const entity = byKey.get(key);
      if (!entity) {
        return;
      }
      if (ring === 0) {
        laidOut.push({ key, entity, x: 0, y: 0 });
        return;
      }
      const angle = (2 * Math.PI * index) / sorted.length;
      const radius = ring * ringSpacing;
      laidOut.push({
        key,
        entity,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    });
  }
  return laidOut;
}
