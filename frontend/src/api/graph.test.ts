import { describe, expect, it } from "vitest";

import { mockGraphPath, mockGraphSearchResult } from "../test/mocks/handlers";
import {
  getGraphEntity,
  getGraphNeighbors,
  getGraphPath,
  getGraphSubgraph,
  searchGraphEntities,
} from "./graph";

const ZONE_ID = "11111111-1111-1111-1111-111111111111";

describe("graph API module", () => {
  it("getGraphEntity returns a node by kind and id", async () => {
    const result = await getGraphEntity("zone", ZONE_ID);
    expect(result.kind).toBe("zone");
    expect(result.id).toBe(ZONE_ID);
  });

  it("getGraphNeighbors returns the one-hop neighborhood", async () => {
    const result = await getGraphNeighbors("zone", ZONE_ID);
    expect(result.entity.kind).toBe("zone");
    expect(result.neighbors.length).toBeGreaterThan(0);
    expect(result.neighbors[0].edge.relation).toBe("contains");
  });

  it("getGraphSubgraph returns a bounded nodes/edges pair", async () => {
    const result = await getGraphSubgraph("zone", ZONE_ID, { depth: 1, maxNodes: 60 });
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("searchGraphEntities returns matching entities", async () => {
    const result = await searchGraphEntities("tank");
    expect(result).toEqual(mockGraphSearchResult);
  });

  it("getGraphPath returns the edge chain between two entities", async () => {
    const result = await getGraphPath(
      { kind: "recommendation", id: "a1|tier_critical" },
      { kind: "risk_assessment", id: "a1" },
    );
    expect(result).toEqual(mockGraphPath);
  });
});
