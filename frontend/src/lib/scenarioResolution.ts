import type { ScenarioSummary } from "../api/types";

/**
 * Mirrors `src/knowledge_graph/service.py::_resolve_scenario_key`
 * exactly - which cataloged scenario a given (zone, tick) belongs to,
 * found by real time-window/zone-membership containment, never a
 * guess. Used wherever a page needs Operational Foresight for an
 * arbitrary persisted assessment that isn't necessarily the one
 * currently active in `ReplayContext`.
 */
export function resolveScenarioKey(
  scenarios: ScenarioSummary[] | undefined,
  zoneId: string | undefined,
  timestamp: string | undefined,
): string | undefined {
  if (!scenarios || !zoneId || !timestamp) {
    return undefined;
  }
  const tickTime = new Date(timestamp).getTime();
  const match = scenarios.find(
    (scenario) =>
      scenario.zone_ids.includes(zoneId) &&
      new Date(scenario.start_time).getTime() <= tickTime &&
      tickTime <= new Date(scenario.end_time).getTime(),
  );
  return match?.key;
}
