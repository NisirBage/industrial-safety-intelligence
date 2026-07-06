import { useState } from "react";

import { PermitGroup } from "../components/permits/PermitGroup";
import { useZones } from "../hooks/useZones";

export function PermitsPage() {
  const [zoneId, setZoneId] = useState<string | undefined>(undefined);
  const { data: zones } = useZones();

  return (
    <section>
      <h1>Work Authorizations</h1>
      <p className="page-intro">
        Every hot work, confined space, isolation, and line break authorization, grouped by
        status - active, flagged, and suspend-recommended.
      </p>
      <div className="filters">
        <label>
          Zone:{" "}
          <select
            value={zoneId ?? ""}
            onChange={(event) => setZoneId(event.target.value || undefined)}
          >
            <option value="">All zones</option>
            {(zones ?? []).map((zone) => (
              <option key={zone.zone_id} value={zone.zone_id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PermitGroup title="Active" status="active" zoneId={zoneId} zones={zones} />
      <PermitGroup title="Flagged" status="flagged" zoneId={zoneId} zones={zones} />
      <PermitGroup
        title="Suspend Recommended"
        status="suspend_recommended"
        zoneId={zoneId}
        zones={zones}
      />
    </section>
  );
}
