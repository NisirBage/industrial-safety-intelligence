import { useEffect, useState } from "react";

import type { GraphEntity, GraphNeighbor } from "../../api/types";
import { useGraphNeighbors } from "../../hooks/useGraphNeighbors";
import { QueryResult } from "../common/QueryResult";

function groupByRelation(neighbors: GraphNeighbor[]): Map<string, GraphNeighbor[]> {
  const groups = new Map<string, GraphNeighbor[]>();
  for (const neighbor of neighbors) {
    const bucket = groups.get(neighbor.edge.relation) ?? [];
    bucket.push(neighbor);
    groups.set(neighbor.edge.relation, bucket);
  }
  return groups;
}

/**
 * M26 Part 8 (Root Cause Navigation) - a guided, clickable drill-down
 * from any starting entity (typically a Recommendation or Risk
 * Assessment) through every real relation it has: contributing
 * agents, sensors, equipment, workers, permits, historical evidence,
 * lessons learned. This is not special-cased per entity kind - it
 * just groups the same real neighbors NodeInspector shows by relation
 * and lets the operator keep drilling in, one real hop at a time,
 * building a trail exactly like a "why" investigation would.
 */
export function RootCauseNavigator({
  start,
  onFocusEntity,
}: {
  start: GraphEntity;
  onFocusEntity: (entity: GraphEntity) => void;
}) {
  const [trail, setTrail] = useState<GraphEntity[]>([start]);

  useEffect(() => {
    setTrail([start]);
  }, [start]);

  const focused = trail[trail.length - 1];
  const neighborsQuery = useGraphNeighbors(focused.kind, focused.id);
  const grouped = groupByRelation(neighborsQuery.data?.neighbors ?? []);

  const drillInto = (entity: GraphEntity) => {
    setTrail((prev) => [...prev, entity]);
    onFocusEntity(entity);
  };

  const jumpTo = (index: number) => {
    setTrail((prev) => prev.slice(0, index + 1));
    onFocusEntity(trail[index]);
  };

  return (
    <div className="graph-root-cause">
      <h4>Root Cause Navigation</h4>
      <ol className="graph-root-cause-trail">
        {trail.map((entity, index) => (
          <li key={`${entity.kind}:${entity.id}:${index}`}>
            {index > 0 && <span className="graph-root-cause-arrow">→</span>}
            <button type="button" onClick={() => jumpTo(index)} disabled={index === trail.length - 1}>
              {entity.kind.replace(/_/g, " ")}: {entity.label}
            </button>
          </li>
        ))}
      </ol>

      <QueryResult
        isLoading={neighborsQuery.isLoading}
        error={neighborsQuery.error}
        isEmpty={grouped.size === 0}
        emptyLabel="No further evidence connected to this entity."
        onRetry={() => neighborsQuery.refetch()}
      >
        <div className="graph-root-cause-groups">
          {[...grouped.entries()].map(([relation, neighbors]) => (
            <div key={relation} className="graph-root-cause-group">
              <h5>{relation.replace(/_/g, " ")}</h5>
              <ul>
                {neighbors.map((neighbor) => (
                  <li key={`${neighbor.entity.kind}:${neighbor.entity.id}`}>
                    <button type="button" onClick={() => drillInto(neighbor.entity)}>
                      <span className="graph-root-cause-kind">
                        {neighbor.entity.kind.replace(/_/g, " ")}
                      </span>
                      <span className="graph-root-cause-label">{neighbor.entity.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </QueryResult>
    </div>
  );
}
