import { Link, useParams, useSearchParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { useReplay } from "../context/ReplayContext";
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
      <h1>Alternative Decision Comparison</h1>
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
            >
              <h3>{zone.name}</h3>
            </Link>
          ))}
        </div>
      </QueryResult>
    </section>
  );
}

/**
 * M23 Part 2 - dual-mode like the other replay-aware pages: when a
 * Time Machine replay is active for this zone, the compared tick
 * always tracks `ReplayContext`'s cursor (`assessmentAt`) instead of
 * the manual dropdown/URL param, so dragging the Time Slider updates
 * this comparison too. The dropdown becomes a read-only display of the
 * replay's own timeline in that case rather than a second, competing
 * source of truth for "which tick".
 */
function ZoneComparison({ zoneId }: { zoneId: string }) {
  const replay = useReplay();
  const isReplayMode = replay.target !== null && replay.zoneIds.includes(zoneId);

  const [searchParams, setSearchParams] = useSearchParams();
  const { data: zones } = useZones();
  const liveHistory = useRiskHistory(zoneId, { limit: TIMESTAMP_CHOICE_LIMIT });
  const liveItems = liveHistory.data?.items ?? [];

  const requestedTimestamp = searchParams.get("timestamp");
  const replayTimestamp = isReplayMode ? replay.assessmentAt(zoneId)?.timestamp ?? null : null;
  const timestamp = isReplayMode ? replayTimestamp : (requestedTimestamp ?? liveItems[0]?.timestamp);

  const items = isReplayMode ? [...replay.zoneTimeline(zoneId)].reverse() : liveItems;
  const historyLoading = isReplayMode ? replay.isLoading : liveHistory.isLoading;
  const historyError = isReplayMode ? replay.error : liveHistory.error;

  const { data: comparison, isLoading: comparisonLoading, error: comparisonError } =
    useCounterfactualComparison(zoneId, timestamp ?? undefined);

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

      {isReplayMode && (
        <p className="digital-twin-replay-banner">
          Following the Time Machine replay cursor for this zone.{" "}
          <Link to="/time-machine">Open Time Machine controls &rarr;</Link>
        </p>
      )}

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
              disabled={isReplayMode}
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
                  <h3>Naive Baseline (Alternative Decision)</h3>
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
