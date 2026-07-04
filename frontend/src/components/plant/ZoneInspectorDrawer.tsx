import { Link } from "react-router-dom";

import type { Tier } from "../../api/types";
import { TierBadge } from "../common/TierBadge";
import { usePermits } from "../../hooks/usePermits";
import { useZoneEquipment, useZoneSensors, useWorkers } from "../../hooks/useScenarioBuilder";
import { useZones } from "../../hooks/useZones";
import { formatTimestamp } from "../../lib/format";
import { formatPermitType, permitTypeGlyph } from "../../lib/permitIcons";

export interface ZoneInspectorDrawerProps {
  zoneId: string;
  name: string;
  tier: Tier;
  compoundRiskScore: number;
  confidence: number;
  timestamp: string;
  /** Set only when the Digital Twin is showing a Time Machine replay
   * cursor rather than live data - lets the drawer say so instead of
   * silently implying "this is happening right now". */
  isReplaySnapshot?: boolean;
  /** Optional - the Operations Center embeds this drawer permanently
   * for the focused zone (there's nothing to "close" back to), so it
   * omits this and the close button simply isn't rendered. */
  onClose?: () => void;
}

/**
 * M16 (Digital Twin) - the drill-down every zone click on the map
 * opens. Every list here is real, already-persisted plant data from
 * endpoints this platform already exposed for the Scenario Builder
 * (`GET /zones/{id}/sensors`, `GET /zones/{id}/equipment`,
 * `GET /workers`) and Permits (`GET /permits?zone_id=`) - nothing is
 * computed here, this is a read-only inspector, matching the
 * "everything displayed must originate from persisted data" rule
 * this project has held since the Decision Graph milestone.
 */
export function ZoneInspectorDrawer({
  zoneId,
  name,
  tier,
  compoundRiskScore,
  confidence,
  timestamp,
  isReplaySnapshot = false,
  onClose,
}: ZoneInspectorDrawerProps) {
  const { data: zones } = useZones();
  const zoneMeta = zones?.find((z) => z.zone_id === zoneId);
  const { data: sensors, isLoading: sensorsLoading } = useZoneSensors(zoneId);
  const { data: equipment, isLoading: equipmentLoading } = useZoneEquipment(zoneId);
  const { data: workers, isLoading: workersLoading } = useWorkers();
  const { data: permits, isLoading: permitsLoading } = usePermits({ zone_id: zoneId });

  const zoneWorkers = (workers ?? []).filter((worker) => worker.current_zone_id === zoneId);

  return (
    <aside className="zone-inspector-drawer" aria-label={`${name} inspector`}>
      <div className="zone-inspector-header">
        <div>
          <h3>{name}</h3>
          {zoneMeta && (
            <p className="zone-inspector-subtitle">
              {zoneMeta.plant_section} &middot; OISD {zoneMeta.oisd_area_classification}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" className="zone-inspector-close" onClick={onClose} aria-label="Close inspector">
            &times;
          </button>
        )}
      </div>

      <p className="zone-inspector-status">
        <TierBadge tier={tier} /> {compoundRiskScore.toFixed(1)} &middot; {(confidence * 100).toFixed(0)}%
        confidence
        <br />
        {isReplaySnapshot ? "Replay tick: " : "As of: "}
        {formatTimestamp(timestamp)}
      </p>

      <div className="zone-inspector-links">
        <Link to={`/zones/${zoneId}`}>Zone detail &rarr;</Link>
        <Link to="/time-machine">Time Machine &rarr;</Link>
        <Link to={`/operations?zone=${zoneId}`}>Operations Center &rarr;</Link>
      </div>

      <section className="zone-inspector-section">
        <h4>Gas Sensors {sensors && `(${sensors.length})`}</h4>
        {sensorsLoading && <p>Loading…</p>}
        {sensors && sensors.length === 0 && <p>No sensor monitors this zone.</p>}
        {sensors && sensors.length > 0 && (
          <ul>
            {sensors.map((sensor) => (
              <li key={sensor.sensor_id}>
                <strong>{sensor.gas_type}</strong> &middot; alarm threshold {sensor.alarm_threshold}
                {sensor.last_calibrated_at && (
                  <> &middot; calibrated {formatTimestamp(sensor.last_calibrated_at)}</>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="zone-inspector-section">
        <h4>Workers {`(${zoneWorkers.length})`}</h4>
        {workersLoading && <p>Loading…</p>}
        {!workersLoading && zoneWorkers.length === 0 && <p>No workers currently assigned to this zone.</p>}
        {zoneWorkers.length > 0 && (
          <ul>
            {zoneWorkers.map((worker) => (
              <li key={worker.worker_id}>
                {worker.role} <span className="zone-inspector-id">({worker.worker_id.slice(0, 8)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="zone-inspector-section">
        <h4>Equipment {equipment && `(${equipment.length})`}</h4>
        {equipmentLoading && <p>Loading…</p>}
        {equipment && equipment.length === 0 && <p>No equipment recorded in this zone.</p>}
        {equipment && equipment.length > 0 && (
          <ul>
            {equipment.map((item) => (
              <li key={item.equipment_id}>
                {item.equipment_type} &middot; {item.isolation_status}
                {item.maintenance_flag && <span className="zone-inspector-flag"> Maintenance flagged</span>}
                {item.loto_confirmed && <span className="zone-inspector-flag"> LOTO confirmed</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="zone-inspector-section">
        <h4>Permits {permits && `(${permits.count})`}</h4>
        {permitsLoading && <p>Loading…</p>}
        {permits && permits.items.length === 0 && <p>No permits recorded in this zone.</p>}
        {permits && permits.items.length > 0 && (
          <ul>
            {permits.items.map((permit) => (
              <li key={permit.permit_id} className={`zone-inspector-permit zone-inspector-permit-${permitTypeGlyph(permit.permit_type)}`}>
                <strong>{formatPermitType(permit.permit_type)}</strong> &middot; {permit.status}
                <br />
                {formatTimestamp(permit.issued_at)} &rarr; {formatTimestamp(permit.expires_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
