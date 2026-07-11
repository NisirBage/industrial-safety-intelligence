import { useState } from "react";

import type { GraphEntity } from "../../api/types";
import { useGraphSearch } from "../../hooks/useGraphSearch";

/**
 * M26 Part 5 (search) - substring search over the queryable entity
 * kinds (see GraphService.search). Results are just real entities;
 * picking one recenters the canvas via `onSelect`.
 */
export function GraphSearchBar({ onSelect }: { onSelect: (entity: GraphEntity) => void }) {
  const [query, setQuery] = useState("");
  const searchQuery = useGraphSearch(query);
  const results = searchQuery.data?.results ?? [];
  const showResults = query.trim().length > 0;

  return (
    <div className="graph-search-bar">
      <input
        type="search"
        placeholder="Search zones, sensors, workers, equipment, incidents…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search the knowledge graph"
      />
      {showResults && (
        <ul className="graph-search-results">
          {searchQuery.isLoading && <li className="graph-search-empty">Searching…</li>}
          {!searchQuery.isLoading && results.length === 0 && (
            <li className="graph-search-empty">No matches.</li>
          )}
          {results.map((entity) => (
            <li key={`${entity.kind}:${entity.id}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(entity);
                  setQuery("");
                }}
              >
                <span className="graph-search-result-kind">{entity.kind.replace(/_/g, " ")}</span>
                <span className="graph-search-result-label">{entity.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
