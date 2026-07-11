import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { GraphEntity } from "../../api/types";

/**
 * M26 Part 5 (Graph visualization) - the one node renderer every
 * entity kind shares, styled by kind via a CSS class. Hover/selection
 * states are plain CSS (`:hover`, React Flow's own `.selected` class)
 * - no JS-driven hover logic.
 */
export function EntityNode({ data, selected }: NodeProps) {
  const entity = data.entity as GraphEntity;
  return (
    <div
      className={`graph-node graph-node-${entity.kind}${selected ? " graph-node-selected" : ""}`}
      title={entity.label}
    >
      <Handle type="target" position={Position.Top} />
      <span className="graph-node-kind">{entity.kind.replace(/_/g, " ")}</span>
      <span className="graph-node-label">{entity.label}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
