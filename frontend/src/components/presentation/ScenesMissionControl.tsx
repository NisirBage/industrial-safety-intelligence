import type { RiskAssessment, Zone } from "../../api/types";
import { TierBadge } from "../common/TierBadge";
import { PlantMap, type PlantMapZone } from "../plant/PlantMap";
import type { PrioritizedAction } from "../../lib/actionPlaybook";
import { zoneLabel } from "../../lib/format";
import type { RiskJustification } from "../../lib/justification";
import { rankContributingFactors } from "../../lib/rootCause";
import { AnimatedCounter } from "./AnimatedCounter";

/**
 * M20 Part 3, Scene 7 - a condensed version of the just-built Mission
 * Control page (Part 1): the live-synced Digital Twin, Live Alerts
 * across every zone in this replay, and the top two Decision
 * Contributors for the focus zone, all on one slide. Every value comes
 * from the same replay-cursor data the rest of the tour already reads
 * - nothing here is computed only for this slide.
 */
export function Scene7MissionControl({
  mapZones,
  focusZoneId,
  zones,
  cursorAssessments,
  justification,
  topActions,
}: {
  mapZones: PlantMapZone[];
  focusZoneId: string | null;
  zones: Zone[] | undefined;
  cursorAssessments: RiskAssessment[];
  justification: RiskJustification | null;
  topActions: PrioritizedAction[];
}) {
  const alerts = cursorAssessments.filter((a) => a.tier !== "normal");
  const topFactors = rankContributingFactors(justification).slice(0, 2);

  return (
    <div className="scene scene-mission-control">
      <h2 className="scene-heading">Mission Control</h2>
      <div className="scene-mission-control-grid">
        <div className="scene-mission-control-twin">
          <PlantMap zones={mapZones} selectedZoneId={focusZoneId} />
        </div>
        <div>
          <h3>Live Alerts</h3>
          {alerts.length === 0 ? (
            <p>No zone is currently above NORMAL.</p>
          ) : (
            <ul className="alert-list">
              {alerts.map((zone) => (
                <li key={zone.zone_id} className={`alert-item alert-${zone.tier}`}>
                  {zoneLabel(zone.zone_id, zones)} <TierBadge tier={zone.tier} />{" "}
                  {zone.compound_risk_score.toFixed(1)}
                </li>
              ))}
            </ul>
          )}
          <h3>Decision Contributors</h3>
          {topFactors.length === 0 ? (
            <p>No decision explanation available.</p>
          ) : (
            <ul>
              {topFactors.map((factor) => (
                <li key={factor.agentName}>
                  <strong>{factor.displayName}</strong> &mdash; {factor.risk.toFixed(1)}
                </li>
              ))}
            </ul>
          )}
          <h3>Top Recommended Action</h3>
          {topActions.length === 0 ? (
            <p>No recommended actions right now.</p>
          ) : (
            <p>{topActions[0].text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * M20 Part 3, Scene 8 - "Final Recommendation": of everything the
 * platform could surface, the single top-priority action for this
 * incident, shown large. `topActions[0]` is `buildActionQueue`'s own
 * positional priority-1 entry - not a new ranking model.
 */
export function Scene8FinalRecommendation({
  topActions,
  zoneName,
}: {
  topActions: PrioritizedAction[];
  zoneName: string;
}) {
  const top = topActions[0];

  return (
    <div className="scene scene-final-recommendation">
      <h2 className="scene-heading">Final Recommendation</h2>
      {top ? (
        <div className="card scene-final-recommendation-card">
          <div className="mission-control-action-header">
            <strong>{zoneName}</strong>
            <span className="impact-badge">{top.impactLevel}</span>
          </div>
          <p className="scene-final-recommendation-text">{top.text}</p>
          <p className="kpi-sub">
            ETA: {top.metadata.eta} &middot; {top.metadata.requiredPersonnel}
          </p>
        </div>
      ) : (
        <p>No recommended action for this incident right now.</p>
      )}
    </div>
  );
}

/**
 * M20 Part 3, Scene 9 - "Business Impact": a real, non-fabricated
 * duration (minutes between the first escalation tick and the peak
 * tick, both real persisted timestamps already used elsewhere in this
 * tour) plus a qualitative "would a legacy single-sensor alarm have
 * caught this" check reusing the same real counterfactual comparison
 * `Scene8Counterfactual` reads, plus the tour's own already-authored
 * business-value talking points - never a fabricated dollar figure.
 */
export function Scene9BusinessImpact({
  leadTimeMinutes,
  missedByLegacyBaseline,
  businessValueBullets,
}: {
  leadTimeMinutes: number | null;
  missedByLegacyBaseline: boolean | null;
  businessValueBullets: string[];
}) {
  return (
    <div className="scene scene-business-impact">
      <h2 className="scene-heading">Business Impact</h2>
      <div className="scene-title-stats">
        <div>
          <span className="scene-stat-value">
            {leadTimeMinutes !== null ? (
              <>
                <AnimatedCounter value={leadTimeMinutes} decimals={0} /> min
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="scene-stat-label">Advance warning before peak severity</span>
        </div>
        <div>
          <span className="scene-stat-value">
            {missedByLegacyBaseline === null ? "—" : missedByLegacyBaseline ? "Missed" : "Caught"}
          </span>
          <span className="scene-stat-label">Legacy single-sensor alarm, same tick</span>
        </div>
      </div>
      <ul className="scene-business-impact-bullets">
        {businessValueBullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </div>
  );
}
