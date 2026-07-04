import { useState } from "react";

import type { PrioritizedAction } from "../../lib/actionPlaybook";
import { buildDependencyLevels } from "../../lib/dependencyGraph";

const IMPACT_CLASS: Record<string, string> = {
  CRITICAL: "impact-critical",
  "VERY HIGH": "impact-very-high",
  HIGH: "impact-high",
  MODERATE: "impact-moderate",
  LOW: "impact-low",
  INFORMATIONAL: "impact-informational",
};

/**
 * Item 3 (Operational Dependency Graph) - a fixed, top-to-bottom chain
 * of this tick's own active recommendations, laid out by
 * `buildDependencyLevels` (topological sort over the same `dependsOn`
 * config the Action Queue's "Dependencies" field already reads - one
 * source of truth, two views). Pure visualization: no new ordering
 * logic beyond the topological layering itself, no risk computation.
 */
export function OperationalDependencyGraph({ actions }: { actions: PrioritizedAction[] }) {
  const [tracing, setTracing] = useState(false);
  const levels = buildDependencyLevels(actions);

  if (levels.length === 0) {
    return <p>No active actions to sequence right now.</p>;
  }

  return (
    <div className="dependency-graph">
      <button
        type="button"
        className="dependency-graph-trace-button"
        disabled={tracing}
        onClick={() => {
          setTracing(true);
          window.setTimeout(() => setTracing(false), levels.length * 500 + 600);
        }}
      >
        {tracing ? "Tracing…" : "Trace response sequence"}
      </button>

      {levels.map((levelGroup, levelIndex) => (
        <div key={levelGroup.level} className="dependency-graph-level">
          <div className="dependency-graph-level-nodes">
            {levelGroup.actions.map((action) => (
              <div
                key={action.id}
                className={`dependency-graph-node ${IMPACT_CLASS[action.impactLevel] ?? ""} ${
                  tracing ? "dependency-graph-node-tracing" : ""
                }`}
                style={tracing ? { animationDelay: `${levelIndex * 0.5}s` } : undefined}
                title={action.text}
              >
                {action.text}
              </div>
            ))}
          </div>
          {levelIndex < levels.length - 1 && <div className="dependency-graph-arrow">&darr;</div>}
        </div>
      ))}
    </div>
  );
}
