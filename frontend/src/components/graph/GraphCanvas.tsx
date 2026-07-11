import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { GraphEdge, GraphEntity } from "../../api/types";
import { edgeKey, layoutRadial, nodeKey } from "../../lib/graphLayout";
import { EntityNode } from "./EntityNode";

const nodeTypes = { entity: EntityNode };

/**
 * M26 Part 5 (Graph visualization) - zoom/pan/drag/minimap come from
 * React Flow itself; layout is the deterministic radial layout in
 * lib/graphLayout.ts, never a force simulation. `highlightedEdgeIds`
 * is used by Judge Mode (Part 13) to animate one specific path
 * without touching the rest of the canvas.
 */
export function GraphCanvas({
  nodes,
  edges,
  rootKey,
  selectedKey,
  highlightedEdgeIds,
  onSelectNode,
}: {
  nodes: GraphEntity[];
  edges: GraphEdge[];
  rootKey: string;
  selectedKey: string | null;
  highlightedEdgeIds?: Set<string>;
  onSelectNode: (entity: GraphEntity) => void;
}) {
  const laidOut = useMemo(() => layoutRadial(rootKey, nodes, edges), [rootKey, nodes, edges]);
  const laidOutKeys = useMemo(() => new Set(laidOut.map((item) => item.key)), [laidOut]);

  const rfNodes: RFNode[] = laidOut.map((item) => ({
    id: item.key,
    type: "entity",
    position: { x: item.x, y: item.y },
    data: { entity: item.entity },
    selected: item.key === selectedKey,
  }));

  const rfEdges: RFEdge[] = edges
    .map((edge) => {
      const id = edgeKey(edge);
      const highlighted = highlightedEdgeIds?.has(id) ?? false;
      return {
        id,
        source: nodeKey(edge.source_kind, edge.source_id),
        target: nodeKey(edge.target_kind, edge.target_id),
        label: edge.relation.replace(/_/g, " "),
        animated: highlighted,
        className: highlighted ? "graph-edge-highlighted" : undefined,
      };
    })
    .filter((edge) => laidOutKeys.has(edge.source) && laidOutKeys.has(edge.target));

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => {
          const entity = (node.data as { entity: GraphEntity }).entity;
          onSelectNode(entity);
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
