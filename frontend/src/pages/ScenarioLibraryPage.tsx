import { Link } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { useScenarios } from "../hooks/useScenarios";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";

/**
 * Item 2 (scenario library) + entry point for item 3 (interactive
 * scenario replay) - lists every scenario GET /scenarios returns
 * (scenarios/*.yaml, already replayed and persisted; this page never
 * triggers a run, see docs/frontend/README.md).
 */
export function ScenarioLibraryPage() {
  const { data, isLoading, error } = useScenarios();
  const { data: zones } = useZones();
  const scenarios = data ?? [];

  return (
    <section>
      <h1>Scenario Library</h1>
      <p className="page-intro">
        Deterministic, pre-authored incidents - each one already replayed through the real
        pipeline and persisted. Selecting one opens an interactive timeline over its actual
        history; nothing here runs a simulation live.
      </p>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={scenarios.length === 0}
        emptyLabel="No scenarios found."
      >
        <div className="card-grid">
          {scenarios.map((scenario) => (
            <Link
              key={scenario.key}
              to={`/scenarios/${scenario.key}`}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{scenario.title}</h3>
              <p>{scenario.description}</p>
              <p>
                {formatTimestamp(scenario.start_time)} &ndash; {formatTimestamp(scenario.end_time)}
              </p>
              <p>
                Zones: {scenario.zone_ids.map((id) => zoneLabel(id, zones)).join(", ")}
              </p>
            </Link>
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
