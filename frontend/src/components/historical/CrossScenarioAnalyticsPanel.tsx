import { QueryResult } from "../common/QueryResult";
import { useHistoricalAnalytics } from "../../hooks/useHistoricalAnalytics";
import type { RuleFrequency } from "../../api/types";

function FrequencyList({ title, items }: { title: string; items: RuleFrequency[] }) {
  return (
    <div className="historical-analytics-column">
      <h5>{title}</h5>
      {items.length === 0 ? (
        <p className="kpi-sub">None recorded across indexed incidents.</p>
      ) : (
        <ul className="historical-analytics-list">
          {items.map((item) => (
            <li key={item.rule}>
              <span className="rule-tag">{item.rule}</span> &times;{item.incident_count}
              <p className="kpi-sub">{item.lesson}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * M24 Part 9 (Cross-Scenario Analytics) - deterministic aggregation
 * over every indexed historical tick. Two fields the milestone asked
 * for ("most effective interventions", "industry comparisons") are
 * rendered as an honest "Status: Unavailable" notice rather than a
 * fabricated number - this platform has no intervention mechanic and
 * (per the deck-fabrication decision in src/historical/decks.py) only
 * one real deck, so neither question is answerable yet. Same
 * disclosed-limitation pattern DiagnosticsPage already established.
 */
export function CrossScenarioAnalyticsPanel({ deckKey }: { deckKey: string | undefined }) {
  const { data, isLoading, error, refetch } = useHistoricalAnalytics(deckKey);

  return (
    <div className="card historical-analytics-panel">
      <h3>Cross-Scenario Analytics</h3>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={data !== undefined && data.total_indexed_ticks === 0}
        emptyLabel="No historical ticks are indexed yet."
        onRetry={() => void refetch()}
      >
        {data && (
          <>
            <p className="kpi-sub">
              {data.total_incidents} incident(s), {data.total_indexed_ticks} indexed tick(s).
            </p>
            <div className="historical-analytics-grid">
              <FrequencyList title="Most common causes" items={data.most_common_causes} />
              <FrequencyList title="Most common equipment issues" items={data.most_common_equipment_issues} />
              <FrequencyList title="Most common permit conflicts" items={data.most_common_permit_conflicts} />
              <FrequencyList title="Most common worker hazards" items={data.most_common_worker_hazards} />
            </div>
            <p>
              Average resolution time:{" "}
              {data.average_resolution_minutes !== null
                ? `${data.average_resolution_minutes.toFixed(1)} minutes`
                : "Status: Unavailable — no closed escalation episodes recorded yet."}
            </p>
            <p className="historical-unavailable-notice">
              Most effective interventions — Status: Unavailable — Reason:{" "}
              {data.most_effective_interventions.reason}
            </p>
            <p className="historical-unavailable-notice">
              Industry comparisons — Status: Unavailable — Reason: {data.industry_comparisons.reason}
            </p>
          </>
        )}
      </QueryResult>
    </div>
  );
}
