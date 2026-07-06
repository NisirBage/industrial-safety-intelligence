import { useState } from "react";
import { Link } from "react-router-dom";

import type { RiskAssessment } from "../api/types";
import { QueryResult } from "../components/common/QueryResult";
import { PlantMap, type PlantMapZone } from "../components/plant/PlantMap";
import { ZoneInspectorDrawer } from "../components/plant/ZoneInspectorDrawer";
import { useReplay } from "../context/ReplayContext";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { usePermits } from "../hooks/usePermits";
import { useAllZoneSensors } from "../hooks/useScenarioBuilder";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { parseJustification } from "../lib/justification";
import { activePermitTypesForZone } from "../lib/permitIcons";
import { zoneLabel } from "../lib/format";

/**
 * M16 (Digital Twin) - the flagship "this is the plant" screen: an
 * interactive site plan with zones, workers, equipment, gas sensors,
 * permits, and a risk heatmap, all drawn from data other pages
 * already expose. Nothing here is a new computation.
 *
 * Dual-mode, the same pattern `TimeMachinePage` established: when a
 * Time Machine replay is active (`ReplayContext.target !== null`) the
 * twin shows that replay's cursor, so scrubbing/playing the Time
 * Machine updates this page too, with zero duplicated replay logic -
 * both pages read the one shared `ReplayContext`. Otherwise it shows
 * live `/risk/current` data, polled the same way Overview does.
 */
export function DigitalTwinPage() {
  const replay = useReplay();
  const isReplayMode = replay.target !== null;

  const live = useCurrentRisk();
  const { data: zones } = useZones();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const liveZoneIds = (live.data ?? []).map((assessment) => assessment.zone_id);
  const zoneIds = isReplayMode ? replay.zoneIds : liveZoneIds;

  const workerCounts = useZoneWorkerCounts(zoneIds);
  const zoneSensors = useAllZoneSensors(zoneIds);
  const { data: activePermits } = usePermits({ status: "active" });

  const entries: { zoneId: string; assessment: RiskAssessment }[] = isReplayMode
    ? zoneIds
        .map((zoneId) => ({ zoneId, assessment: replay.assessmentAt(zoneId) }))
        .filter((entry): entry is { zoneId: string; assessment: RiskAssessment } => entry.assessment !== null)
    : (live.data ?? []).map((assessment) => ({ zoneId: assessment.zone_id, assessment }));

  const mapZones: PlantMapZone[] = entries.map(({ zoneId, assessment }, index) => {
    const justification = parseJustification(assessment.justification);
    return {
      zoneId,
      name: zoneLabel(zoneId, zones),
      tier: assessment.tier,
      compoundRiskScore: assessment.compound_risk_score,
      confidence: assessment.confidence,
      timestamp: assessment.timestamp,
      workerCount: workerCounts[index]?.data?.worker_count,
      activePermitTypes: activePermitTypesForZone(activePermits?.items ?? [], zoneId),
      equipmentRisk: justification?.agentContributions.equipment_status?.risk,
      gasRisk: justification?.agentContributions.gas_risk?.risk,
      gasType: zoneSensors[index]?.data?.[0]?.gas_type,
    };
  });

  const selected = mapZones.find((zone) => zone.zoneId === selectedZoneId);

  const isLoading = isReplayMode ? replay.isLoading : live.isLoading;
  const error = isReplayMode ? replay.error : live.error;

  return (
    <section>
      <h1>Digital Twin</h1>
      <p className="page-intro">
        The plant as one interactive site plan - zones, workers, equipment, gas sensors, and
        work authorizations, colored by the same overall plant risk the rest of this platform
        computes. Click a
        zone to inspect it.
      </p>

      {isReplayMode && (
        <p className="digital-twin-replay-banner">
          Showing a Time Machine replay tick, not live data.{" "}
          <Link to="/time-machine">Open Time Machine controls &rarr;</Link>
        </p>
      )}

      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={entries.length === 0}
        emptyLabel={
          isReplayMode
            ? "This replay has no data at the current tick."
            : "No safety assessments have been recorded yet."
        }
      >
        <div className="digital-twin-layout">
          <div>
            <PlantMap
              zones={mapZones}
              onZoneClick={setSelectedZoneId}
              showLegend
              selectedZoneId={selectedZoneId}
            />
          </div>

          {selected && (
            <ZoneInspectorDrawer
              zoneId={selected.zoneId}
              name={selected.name}
              tier={selected.tier}
              compoundRiskScore={selected.compoundRiskScore}
              confidence={selected.confidence}
              timestamp={selected.timestamp}
              isReplaySnapshot={isReplayMode}
              onClose={() => setSelectedZoneId(null)}
            />
          )}
        </div>
      </QueryResult>
    </section>
  );
}
