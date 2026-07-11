import { useQuery } from "@tanstack/react-query";

import { getReplay } from "../api/replay";

/** M24 Part 7 (Historical Timeline) - the matched incident's own full
 * replay, fetched via the exact same `GET /replay` every other replay
 * view already uses (no new backend endpoint). Deliberately a plain
 * query, not `ReplayContext` - this is a read-only side-by-side
 * comparison, not a second interactive cursor, so it must not share
 * or disturb the live replay's own state. */
export function useHistoricalReplayComparison(scenarioKey: string | undefined) {
  return useQuery({
    queryKey: ["replay", "historical-comparison", scenarioKey],
    queryFn: () => getReplay({ scenarioKey: scenarioKey as string }),
    enabled: scenarioKey !== undefined,
    staleTime: 5 * 60 * 1000,
  });
}
