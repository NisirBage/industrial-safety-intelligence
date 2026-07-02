import { Link } from "react-router-dom";

import { TierBadge } from "../components/common/TierBadge";
import { QueryResult } from "../components/common/QueryResult";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { formatTimestamp, shortZoneLabel } from "../lib/format";
import { latestTimestamp, worstTier } from "../lib/tier";

export function OverviewPage() {
  const { data, isLoading, error } = useCurrentRisk();
  const zones = data ?? [];

  const plantTier = worstTier(zones.map((zone) => zone.tier));
  const lastUpdate = latestTimestamp(zones.map((zone) => zone.timestamp));

  return (
    <section>
      <h1>Plant Overview</h1>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={zones.length === 0}
        emptyLabel="No risk assessments have been recorded yet."
      >
        <div className="card" style={{ marginBottom: "1rem" }}>
          <p>
            Plant status: {plantTier ? <TierBadge tier={plantTier} /> : "—"}
          </p>
          <p>Last update: {lastUpdate ? formatTimestamp(lastUpdate) : "—"}</p>
          <p>Zones reporting: {zones.length}</p>
        </div>

        <div className="card-grid">
          {zones.map((zone) => (
            <Link
              key={zone.zone_id}
              to={`/zones/${zone.zone_id}`}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{shortZoneLabel(zone.zone_id)}</h3>
              <p>
                <TierBadge tier={zone.tier} />
              </p>
              <p>Compound risk: {zone.compound_risk_score.toFixed(1)}</p>
              <p>Confidence: {(zone.confidence * 100).toFixed(0)}%</p>
              <p>{formatTimestamp(zone.timestamp)}</p>
            </Link>
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
