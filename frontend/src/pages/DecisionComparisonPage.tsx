import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { getRiskHistory } from "../api/risk";
import type { ScenarioSummary, Zone } from "../api/types";
import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZones } from "../hooks/useZones";
import { explainComparison, pickComparisonMoment, type ComparisonMoment } from "../lib/decisionComparison";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";

const HISTORY_LIMIT = 500;

function useZoneHistories(zoneIds: string[]) {
  return useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: ["risk", "history", zoneId, { limit: HISTORY_LIMIT }],
      queryFn: () => getRiskHistory(zoneId, { limit: HISTORY_LIMIT }),
    })),
  });
}

function ScenarioComparisonCard({
  scenario,
  zones,
}: {
  scenario: ScenarioSummary;
  zones: Zone[] | undefined;
}) {
  const histories = useZoneHistories(scenario.zone_ids);
  const startMs = new Date(scenario.start_time).getTime();
  const endMs = new Date(scenario.end_time).getTime();

  const tickPairs = useMemo(
    () =>
      scenario.zone_ids.flatMap((zoneId, index) => {
        const items = histories[index]?.data?.items ?? [];
        return items
          .filter((item) => {
            const t = new Date(item.timestamp).getTime();
            return t >= startMs && t <= endMs;
          })
          .map((item) => ({ zoneId, timestamp: item.timestamp }));
      }),
    [scenario, histories, startMs, endMs],
  );

  const counterfactuals = useZoneCounterfactuals(tickPairs);

  const isLoadingHistories = histories.some((query) => query.isLoading);
  const isLoadingCounterfactuals = counterfactuals.some((query) => query.isLoading);
  const historiesError = histories.find((query) => query.error)?.error;
  const counterfactualsError = counterfactuals.find((query) => query.error)?.error;

  const moments: ComparisonMoment[] = tickPairs
    .map((pair, index) => {
      const data = counterfactuals[index]?.data;
      return data
        ? {
            zoneId: pair.zoneId,
            timestamp: pair.timestamp,
            compound: data.compound,
            counterfactual: data.counterfactual,
          }
        : null;
    })
    .filter((moment): moment is ComparisonMoment => moment !== null);

  const chosen = pickComparisonMoment(moments);
  const chosenZoneIndex = chosen ? scenario.zone_ids.indexOf(chosen.zoneId) : -1;
  const chosenHistoryItem = chosen
    ? (histories[chosenZoneIndex]?.data?.items ?? []).find((item) => item.timestamp === chosen.timestamp)
    : undefined;
  const chosenJustification = chosenHistoryItem
    ? parseJustification(chosenHistoryItem.justification)
    : null;
  const why = chosen ? explainComparison(chosen.compound, chosen.counterfactual, chosenJustification) : null;

  return (
    <div className="card comparison-card">
      <h2>{scenario.title}</h2>
      <p>{scenario.description}</p>
      <QueryResult
        isLoading={isLoadingHistories || isLoadingCounterfactuals}
        error={historiesError || counterfactualsError}
        isEmpty={!chosen || !chosen.compound}
        emptyLabel="No comparable data yet for this scenario."
      >
        {chosen && chosen.compound && (
          <>
            <p className="page-intro">
              {zoneLabel(chosen.zoneId, zones)} &middot; {formatTimestamp(chosen.timestamp)}
            </p>
            <div className="comparison-vs">
              <div className="comparison-side comparison-side-naive">
                <h3>Traditional Threshold System</h3>
                <p className="comparison-verdict">
                  {chosen.counterfactual.alert ? "ALERT" : "CLEAR"}
                </p>
                <p>
                  Highest ratio to alarm threshold:{" "}
                  {chosen.counterfactual.highest_ratio !== null
                    ? chosen.counterfactual.highest_ratio.toFixed(2)
                    : "n/a"}
                </p>
              </div>
              <div className="comparison-vs-label">VS</div>
              <div className="comparison-side comparison-side-compound">
                <h3>Industrial Safety Intelligence</h3>
                <p className="comparison-verdict">
                  <TierBadge tier={chosen.compound.tier} />
                </p>
                <p>Compound score: {chosen.compound.compound_risk_score.toFixed(1)}</p>
              </div>
            </div>
            <div className="card comparison-why">
              <h4>Why the difference</h4>
              <p>{why}</p>
            </div>
            <p>
              <Link
                to={`/counterfactual/${chosen.zoneId}?timestamp=${encodeURIComponent(chosen.timestamp)}`}
              >
                Explore this comparison in detail &rarr;
              </Link>
            </p>
          </>
        )}
      </QueryResult>
    </div>
  );
}

/**
 * Item 6 (decision comparison) - "the strongest demonstration page":
 * for every scenario, the single most dramatic real moment where the
 * traditional single-sensor threshold system and the compound engine
 * genuinely disagree, side by side, with a grounded explanation of
 * why. Every number here comes from GET /counterfactual/{zoneId} (the
 * frozen, independent Counterfactual Comparator, recomputed on
 * demand) paired with the compound engine's own persisted verdict for
 * the same tick - nothing here is a new model or a synthetic example.
 */
export function DecisionComparisonPage() {
  const { data: scenarios, isLoading, error } = useScenarios();
  const { data: zones } = useZones();
  const items = scenarios ?? [];

  return (
    <section>
      <h1>Decision Comparison</h1>
      <p className="page-intro">
        Traditional threshold system vs. Industrial Safety Intelligence, for every scenario - the
        most dramatic real divergence each one contains, not a cherry-picked demo number.
      </p>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyLabel="No scenarios found."
      >
        <div className="comparison-list">
          {items.map((scenario) => (
            <ScenarioComparisonCard key={scenario.key} scenario={scenario} zones={zones} />
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
