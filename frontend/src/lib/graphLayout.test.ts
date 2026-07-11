import { describe, expect, it } from "vitest";

import type { GraphEdge, GraphEntity } from "../api/types";
import { layoutRadial, nodeKey } from "./graphLayout";

function entity(kind: GraphEntity["kind"], id: string): GraphEntity {
  return { kind, id, label: `${kind}:${id}`, attributes: {} };
}

function edge(source: GraphEntity, relation: string, target: GraphEntity): GraphEdge {
  return {
    source_kind: source.kind,
    source_id: source.id,
    relation,
    target_kind: target.kind,
    target_id: target.id,
    label: relation,
  };
}

describe("layoutRadial", () => {
  it("places the root at the origin", () => {
    const root = entity("plant", "plant");
    const laidOut = layoutRadial(nodeKey("plant", "plant"), [root], []);

    expect(laidOut).toHaveLength(1);
    expect(laidOut[0].x).toBe(0);
    expect(laidOut[0].y).toBe(0);
  });

  it("places one-hop neighbors on the first ring", () => {
    const root = entity("zone", "z1");
    const sensor = entity("sensor", "s1");
    const worker = entity("worker", "w1");
    const nodes = [root, sensor, worker];
    const edges = [edge(root, "contains", sensor), edge(root, "contains", worker)];

    const laidOut = layoutRadial(nodeKey("zone", "z1"), nodes, edges, { ringSpacing: 100 });

    const rootNode = laidOut.find((n) => n.key === nodeKey("zone", "z1"));
    const sensorNode = laidOut.find((n) => n.key === nodeKey("sensor", "s1"));
    const workerNode = laidOut.find((n) => n.key === nodeKey("worker", "w1"));

    expect(rootNode?.x).toBe(0);
    expect(rootNode?.y).toBe(0);

    const sensorDistance = Math.hypot(sensorNode?.x ?? 0, sensorNode?.y ?? 0);
    const workerDistance = Math.hypot(workerNode?.x ?? 0, workerNode?.y ?? 0);
    expect(sensorDistance).toBeCloseTo(100);
    expect(workerDistance).toBeCloseTo(100);
  });

  it("places two-hop nodes on the second ring, further out than one-hop nodes", () => {
    const root = entity("zone", "z1");
    const sensor = entity("sensor", "s1");
    const reading = entity("sensor_reading", "r1");
    const nodes = [root, sensor, reading];
    const edges = [edge(root, "contains", sensor), edge(sensor, "produced", reading)];

    const laidOut = layoutRadial(nodeKey("zone", "z1"), nodes, edges, { ringSpacing: 100 });

    const sensorNode = laidOut.find((n) => n.key === nodeKey("sensor", "s1"));
    const readingNode = laidOut.find((n) => n.key === nodeKey("sensor_reading", "r1"));

    const sensorDistance = Math.hypot(sensorNode?.x ?? 0, sensorNode?.y ?? 0);
    const readingDistance = Math.hypot(readingNode?.x ?? 0, readingNode?.y ?? 0);

    expect(readingDistance).toBeGreaterThan(sensorDistance);
    expect(readingDistance).toBeCloseTo(200);
  });

  it("returns an empty layout when the root is not among the nodes", () => {
    const laidOut = layoutRadial(nodeKey("zone", "nonexistent"), [entity("zone", "z1")], []);
    expect(laidOut).toEqual([]);
  });

  it("ignores edges that reference a node outside the given set", () => {
    const root = entity("zone", "z1");
    const edges = [edge(root, "contains", entity("sensor", "not-in-nodes"))];

    const laidOut = layoutRadial(nodeKey("zone", "z1"), [root], edges);

    expect(laidOut).toHaveLength(1);
  });

  it("produces the same layout deterministically across repeated calls", () => {
    const root = entity("zone", "z1");
    const sensor = entity("sensor", "s1");
    const nodes = [root, sensor];
    const edges = [edge(root, "contains", sensor)];

    const first = layoutRadial(nodeKey("zone", "z1"), nodes, edges);
    const second = layoutRadial(nodeKey("zone", "z1"), nodes, edges);

    expect(first).toEqual(second);
  });
});
