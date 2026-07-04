import { Link, useParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { TierBadge } from "../components/common/TierBadge";
import { RiskHistoryChart } from "../components/zone/RiskHistoryChart";
import { TrendIndicator } from "../components/zone/TrendIndicator";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";

const HISTORY_LIMIT = 50;

function ZonePicker() {
  const { data, isLoading, error } = useCurrentRisk();
  const { data: zoneList } = useZones();
  const zones = data ?? [];

  return (
    <section>
      <h1>Zones</h1>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={zones.length === 0}
        emptyLabel="No zones have reported a risk assessment yet."
      >
        <div className="card-grid">
          {zones.map((zone) => (
            <Link
              key={zone.zone_id}
              to={`/zones/${zone.zone_id}`}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{zoneLabel(zone.zone_id, zoneList)}</h3>
              <TierBadge tier={zone.tier} />
            </Link>
          ))}
        </div>
      </QueryResult>
    </section>
  );
}

function ZoneDetail({ zoneId }: { zoneId: string }) {
  const { data, isLoading, error } = useRiskHistory(zoneId, { limit: HISTORY_LIMIT });
  const { data: zoneList } = useZones();
  const items = data?.items ?? [];
  const latest = items[0];
  const previous = items[1];

  return (
    <section>
      <p>
        <Link to="/zones">&larr; All zones</Link>
      </p>
      <h1>{zoneLabel(zoneId, zoneList)}</h1>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyLabel="No risk assessment history for this zone yet."
      >
        {latest && (
          <div className="card" style={{ marginBottom: "1rem" }}>
            <p>
              Current risk: {latest.compound_risk_score.toFixed(1)} <TierBadge tier={latest.tier} />
            </p>
            <p>Confidence: {(latest.confidence * 100).toFixed(0)}%</p>
            <p>
              Trend:{" "}
              <TrendIndicator
                current={latest.compound_risk_score}
                previous={previous?.compound_risk_score}
              />
            </p>
            <p>As of {formatTimestamp(latest.timestamp)}</p>
            <p>
              <Link to={`/explain/${latest.assessment_id}`}>Explain this assessment &rarr;</Link>
              {" · "}
              <Link to={`/counterfactual/${zoneId}?timestamp=${encodeURIComponent(latest.timestamp)}`}>
                Compare to naive baseline &rarr;
              </Link>
            </p>
          </div>
        )}
        <RiskHistoryChart history={items} />
      </QueryResult>
    </section>
  );
}

export function ZonePage() {
  const { zoneId } = useParams<{ zoneId: string }>();
  return zoneId ? <ZoneDetail zoneId={zoneId} /> : <ZonePicker />;
}
