import type { RiskAssessment } from "../../api/types";
import { PlantMap, type PlantMapZone } from "../plant/PlantMap";
import { TierBadge } from "../common/TierBadge";
import { AnimatedCounter } from "./AnimatedCounter";
import { formatTimestamp, zoneLabel } from "../../lib/format";
import type { Zone } from "../../api/types";

/** Scene 1 - full-screen title card. Every number here is real:
 * `plantStatus` is the worst tier across all reporting zones (the
 * same `worstTier` every other page already computes), `zoneCount`
 * is `GET /zones`'s own length, `activePermitCount` is
 * `GET /permits?status=active`'s own count. */
export function Scene1Title({
  plantStatus,
  zoneCount,
  activePermitCount,
}: {
  plantStatus: string | null;
  zoneCount: number;
  activePermitCount: number;
}) {
  return (
    <div className="scene scene-title">
      <h1 className="scene-title-heading">Industrial Safety Intelligence</h1>
      <p className="scene-title-sub">A deterministic, explainable early-warning platform</p>
      <div className="scene-title-stats">
        <div>
          <span className="scene-stat-value">
            {plantStatus ? <TierBadge tier={plantStatus} /> : "—"}
          </span>
          <span className="scene-stat-label">Operational status</span>
        </div>
        <div>
          <span className="scene-stat-value">
            <AnimatedCounter value={zoneCount} durationMs={800} />
          </span>
          <span className="scene-stat-label">Monitored zones</span>
        </div>
        <div>
          <span className="scene-stat-value">
            <AnimatedCounter value={activePermitCount} durationMs={800} />
          </span>
          <span className="scene-stat-label">Active work authorizations</span>
        </div>
      </div>
    </div>
  );
}

/** Scene 2 - the Digital Twin, reusing the exact `PlantMap` component
 * every other page already renders, with the legend on so a judge
 * unfamiliar with the icon language can read it unattended. */
export function Scene2DigitalTwin({ mapZones }: { mapZones: PlantMapZone[] }) {
  /* Part 8 (Presentation Mode - "camera movement") - auto-focuses the
   * same smooth zoom/pan Digital Twin's own zone selection uses
   * (`PlantMap`'s `selectedZoneId` prop), on the real highest-risk
   * zone this tick - never a scripted camera path, just the same
   * already-real "which zone needs attention" fact every other scene
   * reads. */
  const highestRiskZone = mapZones.reduce<PlantMapZone | null>((worst, zone) => {
    if (!worst || zone.compoundRiskScore > worst.compoundRiskScore) {
      return zone;
    }
    return worst;
  }, null);

  return (
    <div className="scene scene-digital-twin">
      <h2 className="scene-heading">Live Digital Twin</h2>
      <div className="scene-digital-twin-map">
        <PlantMap zones={mapZones} showLegend selectedZoneId={highestRiskZone?.zoneId ?? null} />
      </div>
    </div>
  );
}

/** Scene 3 - the moment a real replayed scenario first leaves NORMAL,
 * per `lib/presentationScript.ts::findFirstEscalationIndex`. Every
 * value shown is the real persisted `RiskAssessment` at that tick -
 * nothing here is generated for the demo. */
export function Scene3Incident({
  assessment,
  zones,
}: {
  assessment: RiskAssessment | undefined;
  zones: Zone[] | undefined;
}) {
  return (
    <div className="scene scene-incident">
      <h2 className="scene-heading">Incident Detected</h2>
      {assessment ? (
        <div className="scene-incident-card">
          <p className="scene-incident-zone">{zoneLabel(assessment.zone_id, zones)}</p>
          <p className="scene-incident-readout">
            <TierBadge tier={assessment.tier} /> {assessment.compound_risk_score.toFixed(1)}
          </p>
          <p className="scene-incident-time">{formatTimestamp(assessment.timestamp)}</p>
        </div>
      ) : (
        <p>No replay data available.</p>
      )}
    </div>
  );
}
