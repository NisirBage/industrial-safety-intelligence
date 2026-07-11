import { useState } from "react";

import type { GraphEntity } from "../../api/types";
import { useGraphPath } from "../../hooks/useGraphPath";
import { QueryResult } from "../common/QueryResult";
import { GraphSearchBar } from "./GraphSearchBar";

function EntityChip({ entity, onClear }: { entity: GraphEntity; onClear: () => void }) {
  return (
    <div className="graph-path-entity-chip">
      <span className="graph-path-entity-kind">{entity.kind.replace(/_/g, " ")}</span>
      <span className="graph-path-entity-label">{entity.label}</span>
      <button type="button" onClick={onClear} aria-label={`Clear ${entity.label}`}>
        ×
      </button>
    </div>
  );
}

/**
 * M26 Part 7 (Path Explorer) - the deterministic "why" chain between
 * any two picked entities, sourced straight from
 * `GraphService.get_path` (a plain BFS over real, already-shown
 * edges - never a computed explanation). `found: false` means the
 * two entities simply aren't connected within the search depth, not
 * an error.
 */
export function PathExplorer({ onSelectRef }: { onSelectRef: (entity: GraphEntity) => void }) {
  const [source, setSource] = useState<GraphEntity | null>(null);
  const [target, setTarget] = useState<GraphEntity | null>(null);

  const pathQuery = useGraphPath(
    source ? { kind: source.kind, id: source.id } : undefined,
    target ? { kind: target.kind, id: target.id } : undefined,
  );

  return (
    <div className="graph-path-explorer">
      <h4>Path Explorer</h4>
      <p className="graph-path-explorer-hint">
        Pick any two entities to see the real chain of relationships connecting them.
      </p>
      <div className="graph-path-pickers">
        <div className="graph-path-picker">
          <span className="graph-path-picker-label">From</span>
          {source ? (
            <EntityChip entity={source} onClear={() => setSource(null)} />
          ) : (
            <GraphSearchBar onSelect={setSource} />
          )}
        </div>
        <div className="graph-path-picker">
          <span className="graph-path-picker-label">To</span>
          {target ? (
            <EntityChip entity={target} onClear={() => setTarget(null)} />
          ) : (
            <GraphSearchBar onSelect={setTarget} />
          )}
        </div>
      </div>

      {source && target && (
        <QueryResult
          isLoading={pathQuery.isLoading}
          error={pathQuery.error}
          isEmpty={false}
          emptyLabel=""
          onRetry={() => pathQuery.refetch()}
        >
          {pathQuery.data && !pathQuery.data.found && (
            <p className="graph-path-not-found">
              No connection found - these two entities aren't linked by any real relationship
              currently in the graph.
            </p>
          )}
          {pathQuery.data?.found && (
            <ol className="graph-path-chain">
              <li>
                <button type="button" onClick={() => onSelectRef(source)}>
                  <span className="graph-path-chain-kind">{source.kind.replace(/_/g, " ")}</span>
                  <span className="graph-path-chain-label">{source.label}</span>
                </button>
              </li>
              {pathQuery.data.edges.length === 0 && (
                <li className="graph-path-empty-chain">Same entity.</li>
              )}
              {pathQuery.data.edges.map((edge, index) => (
                <li key={`${edge.relation}:${edge.target_kind}:${edge.target_id}:${index}`}>
                  <span className="graph-path-relation">{edge.relation.replace(/_/g, " ")}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectRef({
                        kind: edge.target_kind,
                        id: edge.target_id,
                        label: edge.label,
                        attributes: {},
                      })
                    }
                  >
                    <span className="graph-path-chain-kind">
                      {edge.target_kind.replace(/_/g, " ")}
                    </span>
                    <span className="graph-path-chain-label">{edge.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </QueryResult>
      )}
    </div>
  );
}
