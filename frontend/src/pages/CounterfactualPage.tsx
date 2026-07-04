import { Link, useParams, useSearchParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useCounterfactualComparison } from "../hooks/useCounterfactual";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";

const TIMESTAMP_CHOICE_LIMIT = 50;

/** Item 6 (counterfactual comparison) - the naive single-sensor
 * baseline (GET /counterfactual/{zoneId}, DIL.1) next to the real
 * compound engine's own verdict for the exact same zone/tick, so the
 * gap between them - the entire reason Fusion exists - is visible
 * rather than asserted. Every value here is copied from one of those
 * two already-computed sources; nothing is recomputed. */
function ZonePicker() {
  const { data, isLoading, error } = useZones();
  const zones = data ?? [];

  return (
    <section>
      <h1>Counterfactual Comparison</h1>
      <p className="page-intro">
        Pick a zone to compare the compound engine's verdict against what a naive
        single-sensor-threshold system would have concluded at the same moment.
      </p>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={zones.length === 0}
        emptyLabel="No zones found."
      >
        <div className="card-grid">
          {zones.map((zone) => (
            <Link
              key={zone.zone_id}
              to={`/counterfactual/${zone.zone_id}`}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{zone.name}</h3>
            </Link>
          ))}
        </div>
      </QueryResult>
    </section>
  );
}

function ZoneComparison({ zoneId }: { zoneId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: zones } = useZones();
  const { data: history, isLoading: historyLoading, error: historyError } = useRiskHistory(zoneId, {
    limit: TIMESTAMP_CHOICE_LIMIT,
  });
  const items = history?.items ?? [];

  const requestedTimestamp = searchParams.get("timestamp");
  const timestamp = requestedTimestamp ?? items[0]?.timestamp;

  const { data: comparison, isLoading: comparisonLoading, error: comparisonError } =
    useCounterfactualComparison(zoneId, timestamp);

  const divergence =
    comparison?.compound &&
    ((comparison.compound.tier !== "normal" && !comparison.counterfactual.alert) ||
      (comparison.compound.tier === "normal" && comparison.counterfactual.alert));

  return (
    <section>
      <p>
        <Link to="/counterfactual">&larr; All zones</Link>
      </p>
      <h1>{zoneLabel(zoneId, zones)}</h1>

      <QueryResult
        isLoading={historyLoading}
        error={historyError}
        isEmpty={items.length === 0}
        emptyLabel="No persisted risk history for this zone yet."
      >
        <div className="card" style={{ marginBottom: "1rem" }}>
          <label>
            Assessment tick:{" "}
            <select
              value={timestamp ?? ""}
              onChange={(event) => setSearchParams({ timestamp: event.target.value })}
            >
              {items.map((item) => (
                <option key={item.timestamp} value={item.timestamp}>
                  {formatTimestamp(item.timestamp)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <QueryResult
          isLoading={comparisonLoading}
          error={comparisonError}
          isEmpty={!comparison}
          emptyLabel="No comparison available for this tick."
        >
          {comparison && (
            <>
              {divergence && (
                <div className="card" style={{ marginBottom: "1rem", borderColor: "var(--tier-critical)" }}>
                  <strong>Divergence detected</strong> - the naive baseline and the compound
                  engine disagree at this tick.
                </div>
              )}
              <div className="card-grid">
                <div className="card">
                  <h3>Compound Engine (real)</h3>
                  {comparison.compound ? (
                    <>
                      <p>
                        {comparison.compound.compound_risk_score.toFixed(1)}{" "}
                        <TierBadge tier={comparison.compound.tier} />
                      </p>
                      <p>Confidence: {(comparison.compound.confidence * 100).toFixed(0)}%</p>
                    </>
                  ) : (
                    <p>No persisted compound assessment for this exact tick.</p>
                  )}
                </div>
                <div className="card">
                  <h3>Naive Baseline (counterfactual)</h3>
                  <p>{comparison.counterfactual.alert ? "ALERT" : "CLEAR"}</p>
                  <p>
                    Highest ratio to alarm threshold:{" "}
                    {comparison.counterfactual.highest_ratio !== null
                      ? comparison.counterfactual.highest_ratio.toFixed(2)
                      : "n/a (no sensor data)"}
                  </p>
                  {comparison.counterfactual.triggered_sensors.length > 0 && (
                    <p>Triggered: {comparison.counterfactual.triggered_sensors.join(", ")}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </QueryResult>
      </QueryResult>
    </section>
  );
}

export function CounterfactualPage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  return zoneId ? <ZoneComparison zoneId={zoneId} /> : <ZonePicker />;
}
