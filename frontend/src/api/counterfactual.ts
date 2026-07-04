import { apiGet } from "./client";
import type { CounterfactualComparison } from "./types";

/** GET /api/v1/counterfactual/{zoneId} - naive baseline vs. the
 * compound engine for one zone/tick, Decision Intelligence Layer. */
export function getCounterfactualComparison(
  zoneId: string,
  timestamp: string,
): Promise<CounterfactualComparison> {
  return apiGet<CounterfactualComparison>(`/api/v1/counterfactual/${zoneId}`, {
    timestamp,
  });
}
