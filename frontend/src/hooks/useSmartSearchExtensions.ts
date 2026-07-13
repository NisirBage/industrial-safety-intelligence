import { useQueries } from "@tanstack/react-query";

import { getCounterfactualComparison } from "../api/counterfactual";
import { getForesightForecast } from "../api/foresight";
import { getHistoricalMatches } from "../api/historical";
import { getReplay } from "../api/replay";
import type { ScenarioMoment } from "../lib/enterpriseSearch";
import { useHistoricalAnalytics } from "./useHistoricalAnalytics";
import { useScenarios } from "./useScenarios";

/**
 * M28 Part 7 (Smart Search extension) - assembles one `ScenarioMoment`
 * (that scenario's own single highest-risk tick) per cataloged
 * scenario, the same "one real moment, never a scan" bound
 * `DecisionComparisonPage` already established, plus the deck-level
 * `CrossScenarioAnalytics` aggregate for Lessons/Hazards. Every fetch
 * here is `GET /replay`, `GET /counterfactual`, `GET /historical/matches`,
 * `GET /historical/analytics`, or `GET /foresight/forecast` - endpoints
 * every other page in this app already calls; nothing here is a new
 * REST surface or a new computation.
 */
export function useSmartSearchExtensions(enabled: boolean) {
  const { data: scenarios, isLoading: scenariosLoading } = useScenarios();
  const { data: analytics } = useHistoricalAnalytics();

  const replayQueries = useQueries({
    queries: (scenarios ?? []).map((scenario) => ({
      queryKey: ["replay", { scenarioKey: scenario.key }],
      queryFn: () => getReplay({ scenarioKey: scenario.key }),
      enabled: enabled && scenarios !== undefined,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const candidates = (scenarios ?? [])
    .map((scenario, index) => {
      const replay = replayQueries[index]?.data;
      if (!replay) {
        return null;
      }
      const allTicks = replay.zone_timelines.flatMap((timeline) =>
        timeline.assessments.map((assessment) => ({ zoneId: timeline.zone_id, assessment })),
      );
      if (allTicks.length === 0) {
        return null;
      }
      const top = allTicks.reduce((best, current) =>
        current.assessment.compound_risk_score > best.assessment.compound_risk_score ? current : best,
      );
      return {
        scenarioKey: scenario.key,
        scenarioTitle: scenario.title,
        zoneId: top.zoneId,
        timestamp: top.assessment.timestamp,
        assessmentId: top.assessment.assessment_id,
        events: replay.bookmarks,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const counterfactualQueries = useQueries({
    queries: candidates.map((candidate) => ({
      queryKey: ["counterfactual", candidate.zoneId, candidate.timestamp],
      queryFn: () => getCounterfactualComparison(candidate.zoneId, candidate.timestamp),
      enabled,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const historicalQueries = useQueries({
    queries: candidates.map((candidate) => ({
      queryKey: ["historical", "matches", candidate.zoneId, candidate.timestamp],
      queryFn: () => getHistoricalMatches(candidate.zoneId, candidate.timestamp),
      enabled,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const foresightQueries = useQueries({
    queries: candidates.map((candidate) => ({
      queryKey: ["foresight", "forecast", candidate.zoneId, candidate.timestamp, candidate.scenarioKey],
      queryFn: () => getForesightForecast(candidate.zoneId, candidate.timestamp, candidate.scenarioKey),
      enabled,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const moments: ScenarioMoment[] = candidates.map((candidate, index) => ({
    ...candidate,
    counterfactual: counterfactualQueries[index]?.data,
    bestMatch: historicalQueries[index]?.data?.matches[0],
    foresight: foresightQueries[index]?.data,
  }));

  /** M28 Part 11 (Microinteractions) - true while any of this hook's
   * own fetches are still in flight, so `GlobalSearch` can show
   * "Searching…" instead of a premature "No matches" while
   * Events/Counterfactual/Forecast/Business Impact results haven't
   * arrived yet. */
  const isLoading =
    enabled &&
    (scenariosLoading ||
      replayQueries.some((q) => q.isLoading) ||
      counterfactualQueries.some((q) => q.isLoading) ||
      historicalQueries.some((q) => q.isLoading) ||
      foresightQueries.some((q) => q.isLoading));

  return { moments, analytics, isLoading };
}
