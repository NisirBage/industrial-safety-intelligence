import { getCounterfactualComparison } from "../api/counterfactual";
import { getRiskHistory } from "../api/risk";
import { getScenario } from "../api/scenarios";
import { pickComparisonMoment, type ComparisonMoment } from "./decisionComparison";

export interface DemoKeyMoment {
  zoneId: string;
  timestamp: string;
  assessmentId: string;
}

/**
 * Item 7 (Demo Mode) - the same "most dramatic real divergence" logic
 * Decision Comparison uses (`pickComparisonMoment`), called
 * imperatively rather than through hooks since Demo Mode drives a
 * one-off navigation sequence, not a render. No new computation: this
 * fetches the same three already-existing endpoints
 * (GET /scenarios/{key}, GET /risk/history/{zone}, GET /counterfactual/{zone})
 * Decision Comparison's own component calls, just outside React.
 */
export async function findScenarioKeyMoment(scenarioKey: string): Promise<DemoKeyMoment | null> {
  const scenario = await getScenario(scenarioKey);
  const startMs = new Date(scenario.start_time).getTime();
  const endMs = new Date(scenario.end_time).getTime();

  const zoneHistories = await Promise.all(
    scenario.zone_ids.map((zoneId) =>
      getRiskHistory(zoneId, { limit: 500 }).then((page) => ({ zoneId, items: page.items })),
    ),
  );

  const tickPairs = zoneHistories.flatMap(({ zoneId, items }) =>
    items
      .filter((item) => {
        const t = new Date(item.timestamp).getTime();
        return t >= startMs && t <= endMs;
      })
      .map((item) => ({ zoneId, timestamp: item.timestamp, assessmentId: item.assessment_id })),
  );

  const moments: ComparisonMoment[] = await Promise.all(
    tickPairs.map(async (pair) => {
      const comparison = await getCounterfactualComparison(pair.zoneId, pair.timestamp);
      return {
        zoneId: pair.zoneId,
        timestamp: pair.timestamp,
        compound: comparison.compound,
        counterfactual: comparison.counterfactual,
      };
    }),
  );

  const chosen = pickComparisonMoment(moments);
  if (!chosen) {
    return null;
  }
  const assessmentId = tickPairs.find(
    (pair) => pair.zoneId === chosen.zoneId && pair.timestamp === chosen.timestamp,
  )?.assessmentId;
  if (!assessmentId) {
    return null;
  }
  return { zoneId: chosen.zoneId, timestamp: chosen.timestamp, assessmentId };
}
