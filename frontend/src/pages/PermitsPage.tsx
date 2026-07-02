import { useState } from "react";

import { PermitGroup } from "../components/permits/PermitGroup";
import { useCurrentRisk } from "../hooks/useCurrentRisk";
import { shortZoneLabel } from "../lib/format";

export function PermitsPage() {
  const [zoneId, setZoneId] = useState<string | undefined>(undefined);
  const { data: zones } = useCurrentRisk();

  return (
    <section>
      <h1>Permits</h1>
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
                {shortZoneLabel(zone.zone_id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PermitGroup title="Active" status="active" zoneId={zoneId} />
      <PermitGroup title="Flagged" status="flagged" zoneId={zoneId} />
      <PermitGroup title="Suspend Recommended" status="suspend_recommended" zoneId={zoneId} />
    </section>
  );
}
