import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

import { TierBadge } from "../components/common/TierBadge";
import { QueryResult } from "../components/common/QueryResult";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useAllZoneSensors } from "../hooks/useScenarioBuilder";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { latestTimestamp, worstTier } from "../lib/tier";

/**
 * M11.1 - the plant map (an industrial site plan, not a card list) is
 * now the primary view. The per-zone card grid stays underneath as a
 * compact detail list (still real data, still one card per zone) -
 * this is what OverviewPage.test.tsx's "one card per zone" assertion
 * exercises, so it deliberately isn't removed, just demoted to a
 * secondary role beneath the map.
 *
 * M12.1 - the map's worker/permit/equipment icons and gas-heat overlay
 * are populated here from three already-existing sources: per-zone
 * worker counts (`GET /zones/{id}/workers/count`, M11.0), the active
 * permits list (`GET /permits?status=active`, unchanged since M6),
 * and the Gas Risk/Equipment Status agents' own raw contributions
 * already embedded in each zone's persisted `justification` - the
 * exact same numbers the Explainability page's agent chart shows.
 */
export function OverviewPage() {
  const { data, isLoading, error } = useCurrentRisk();
  const { data: zoneList } = useZones();
  const zones = data ?? [];
  const navigate = useNavigate();

  const zoneIds = useMemo(() => (data ?? []).map((zone) => zone.zone_id), [data]);
  const workerCounts = useZoneWorkerCounts(zoneIds);
  const zoneSensors = useAllZoneSensors(zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const plantTier = worstTier(zones.map((zone) => zone.tier));
  const lastUpdate = latestTimestamp(zones.map((zone) => zone.timestamp));

  const mapZones: PlantMapZone[] = zones.map((zone, index) => {
    const justification = parseJustification(zone.justification);
    return {
      zoneId: zone.zone_id,
      name: zoneLabel(zone.zone_id, zoneList),
      tier: zone.tier,
      compoundRiskScore: zone.compound_risk_score,
      confidence: zone.confidence,
      timestamp: zone.timestamp,
      workerCount: workerCounts[index]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zone.zone_id),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
      gasType: zoneSensors[index]?.data?.[0]?.gas_type,
    };
  });

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

        <div style={{ marginBottom: "1rem" }}>
          <PlantMap zones={mapZones} onZoneClick={(zoneId) => navigate(`/zones/${zoneId}`)} />
        </div>

        <div className="card-grid">
          {zones.map((zone) => (
            <Link
              key={zone.zone_id}
              to={`/zones/${zone.zone_id}`}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{zoneLabel(zone.zone_id, zoneList)}</h3>
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
