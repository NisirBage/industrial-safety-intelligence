import { QueryResult } from "../common/QueryResult";
import { useReplay } from "../../context/ReplayContext";
import { useScenarios } from "../../hooks/useScenarios";

/**
 * Extracted from Time Machine (where it originated) so any
 * replay-driven page - Time Machine, Decision Timeline, Challenge Mode -
 * can start a replay from the same scenario catalog without a second
 * copy of this grid.
 */
export function ScenarioPicker() {
  const { data: scenarios, isLoading, error } = useScenarios();
  const replay = useReplay();

  return (
    <QueryResult
      isLoading={isLoading}
      error={error}
      isEmpty={(scenarios ?? []).length === 0}
      emptyLabel="No scenarios in the library yet."
    >
      <div className="card-grid">
        {(scenarios ?? []).map((scenario) => (
          <button
            key={scenario.key}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => replay.startReplay({ scenarioKey: scenario.key })}
          >
            <h3>{scenario.title}</h3>
            <p>{scenario.description}</p>
          </button>
        ))}
      </div>
    </QueryResult>
  );
}
