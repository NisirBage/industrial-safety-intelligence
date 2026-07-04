import { useQuery } from "@tanstack/react-query";

import { getCounterfactualComparison } from "../api/counterfactual";

/** One zone/tick's naive-baseline-vs-compound comparison - a
 * point-in-time historical lookup, not a live-polled value. */
export function useCounterfactualComparison(
  zoneId: string | undefined,
  timestamp: string | undefined,
) {
  return useQuery({
    queryKey: ["counterfactual", zoneId, timestamp],
    queryFn: () => getCounterfactualComparison(zoneId as string, timestamp as string),
    enabled: zoneId !== undefined && timestamp !== undefined,
  });
}
