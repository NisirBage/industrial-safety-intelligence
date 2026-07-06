import { useState } from "react";

import type { Permit, Zone } from "../../api/types";
import { formatTimestamp, zoneLabel } from "../../lib/format";
import { formatPermitType } from "../../lib/permitIcons";

export function PermitCard({ permit, zones }: { permit: Permit; zones?: Zone[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card permit-card">
      <h4>{formatPermitType(permit.permit_type)}</h4>
      <p>{zoneLabel(permit.zone_id, zones)}</p>
      <p>Issued {formatTimestamp(permit.issued_at)}</p>
      <p>Expires {formatTimestamp(permit.expires_at)}</p>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <dl className="permit-card-detail">
          <dt>Work Authorization ID</dt>
          <dd>{permit.permit_id}</dd>
          <dt>Authorizing officer</dt>
          <dd>{permit.authorizing_officer_id}</dd>
          <dt>Baseline snapshot</dt>
          <dd>
            <pre>{JSON.stringify(permit.baseline_snapshot, null, 2)}</pre>
          </dd>
        </dl>
      )}
    </div>
  );
}
