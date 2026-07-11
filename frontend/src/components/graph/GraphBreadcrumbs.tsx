import type { GraphEntity } from "../../api/types";

/**
 * M26 Part 5 (breadcrumbs) - the trail of entities the canvas has
 * been recentered on. Every crumb except the current (last) one is
 * clickable to jump back.
 */
export function GraphBreadcrumbs({
  trail,
  onSelect,
}: {
  trail: GraphEntity[];
  onSelect: (entity: GraphEntity, index: number) => void;
}) {
  if (trail.length === 0) {
    return null;
  }
  return (
    <nav className="graph-breadcrumbs" aria-label="Graph navigation trail">
      {trail.map((entity, index) => {
        const isCurrent = index === trail.length - 1;
        return (
          <span key={`${entity.kind}:${entity.id}:${index}`} className="graph-breadcrumb-item">
            {index > 0 && <span className="graph-breadcrumb-separator">›</span>}
            {isCurrent ? (
              <span className="graph-breadcrumb-current">{entity.label}</span>
            ) : (
              <button type="button" onClick={() => onSelect(entity, index)}>
                {entity.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
