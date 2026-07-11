import type { GraphEntity } from "../../api/types";
import { useGraphNeighbors } from "../../hooks/useGraphNeighbors";
import { QueryResult } from "../common/QueryResult";

/**
 * M26 Part 6 (Node Details) - selecting a node opens this inspector:
 * its own attributes plus every real neighbor, each clickable. No new
 * data is computed here - `attributes` and `neighbors` both come
 * straight from the read-only GraphService.
 */
export function NodeInspector({
  entity,
  onSelectEntity,
  onRecenter,
}: {
  entity: GraphEntity;
  onSelectEntity: (entity: GraphEntity) => void;
  onRecenter: (entity: GraphEntity) => void;
}) {
  const neighborsQuery = useGraphNeighbors(entity.kind, entity.id);

  return (
    <div className="graph-node-inspector">
      <div className="graph-node-inspector-header">
        <span className="graph-node-inspector-kind">{entity.kind.replace(/_/g, " ")}</span>
        <h3 className="graph-node-inspector-label">{entity.label}</h3>
        <button type="button" className="graph-recenter-button" onClick={() => onRecenter(entity)}>
          Recenter here
        </button>
      </div>

      {Object.keys(entity.attributes).length > 0 && (
        <dl className="graph-node-inspector-attributes">
          {Object.entries(entity.attributes).map(([key, value]) => (
            <div key={key} className="graph-node-inspector-attribute">
              <dt>{key.replace(/_/g, " ")}</dt>
              <dd>{formatAttributeValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <h4 className="graph-node-inspector-section-title">Connected evidence</h4>
      <QueryResult
        isLoading={neighborsQuery.isLoading}
        error={neighborsQuery.error}
        isEmpty={(neighborsQuery.data?.neighbors.length ?? 0) === 0}
        emptyLabel="No connected entities."
        onRetry={() => neighborsQuery.refetch()}
      >
        <ul className="graph-node-inspector-neighbors">
          {neighborsQuery.data?.neighbors.map((neighbor) => (
            <li key={`${neighbor.edge.relation}:${neighbor.entity.kind}:${neighbor.entity.id}`}>
              <button
                type="button"
                className="graph-neighbor-button"
                onClick={() => onSelectEntity(neighbor.entity)}
              >
                <span className="graph-neighbor-relation">
                  {neighbor.edge.relation.replace(/_/g, " ")}
                </span>
                <span className="graph-neighbor-kind">{neighbor.entity.kind.replace(/_/g, " ")}</span>
                <span className="graph-neighbor-label">{neighbor.entity.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </QueryResult>
    </div>
  );
}

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
