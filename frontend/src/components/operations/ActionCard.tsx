import { useState } from "react";
import { Link } from "react-router-dom";

import type { CounterfactualComparison, EquipmentInfo, RiskAssessment } from "../../api/types";
import type { PrioritizedAction } from "../../lib/actionPlaybook";
import { explainComparison } from "../../lib/decisionComparison";
import { formatTimestamp } from "../../lib/format";
import type { RiskJustification } from "../../lib/justification";
import { formatPermitType } from "../../lib/permitIcons";
import { getSopReference } from "../../lib/sopReferences";

const IMPACT_CLASS: Record<string, string> = {
  CRITICAL: "impact-critical",
  "VERY HIGH": "impact-very-high",
  HIGH: "impact-high",
  MODERATE: "impact-moderate",
  LOW: "impact-low",
  INFORMATIONAL: "impact-informational",
};

/**
 * Item 2/7 (Action Queue + Action Cards) - one recommendation,
 * collapsed to Priority/Impact/Reason/Zone/Dependencies, expandable
 * into the full Action Details Drawer: supporting evidence (the exact
 * rule or tier fact that produced it), a Decision Graph link, the
 * counterfactual comparison for this same tick, the replay timestamp,
 * and the real workers/permits/equipment in this zone right now.
 * Every field is either config (ETA, personnel, equipment, SOP - see
 * lib/actionPlaybook.ts / lib/sopReferences.ts) or a value already
 * fetched by the page - nothing here computes anything new.
 */
export function ActionCard({
  action,
  zoneId,
  zoneName,
  assessment,
  justification,
  counterfactual,
  workerCount,
  activePermitTypes,
  equipment,
  onFocusZone,
  defaultExpanded = false,
}: {
  action: PrioritizedAction;
  zoneId: string;
  zoneName: string;
  assessment: RiskAssessment;
  justification: RiskJustification | null;
  counterfactual: CounterfactualComparison | undefined;
  workerCount: number | undefined;
  activePermitTypes: string[];
  equipment: EquipmentInfo[] | undefined;
  onFocusZone?: (zoneId: string) => void;
  /** Item 6 (Presentation Mode Scene 6) - auto-opens the highest
   * priority action's detail without a click, so the guided tour
   * never needs manual interaction. Defaults to false everywhere
   * else - the Operations Center itself is unaffected. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sop = getSopReference(action.id, activePermitTypes);

  const evidence =
    action.id.startsWith("tier_")
      ? `Tier is ${assessment.tier.toUpperCase()} this tick.`
      : `Rule fired: ${action.id}`;

  return (
    <li className={`action-card card ${IMPACT_CLASS[action.impactLevel] ?? ""}`}>
      <button
        type="button"
        className="action-card-header"
        onClick={() => {
          setExpanded((value) => !value);
          onFocusZone?.(zoneId);
        }}
        aria-expanded={expanded}
      >
        <span className="action-card-priority">Priority {action.priority}</span>
        <span className={`impact-badge ${IMPACT_CLASS[action.impactLevel] ?? ""}`}>{action.impactLevel}</span>
        <span className="action-card-text">{action.text}</span>
        <span className="action-card-zone">{zoneName}</span>
      </button>

      <div className="action-card-summary">
        <span>ETA: {action.metadata.eta}</span>
        {action.dependencyLabels.length > 0 && (
          <span>Depends on: {action.dependencyLabels.join(", ")}</span>
        )}
        {sop && (
          <span>
            SOP: {sop.standard} ({sop.section})
          </span>
        )}
      </div>

      {expanded && (
        <div className="action-card-detail">
          <dl>
            <dt>Reason</dt>
            <dd>{action.text}</dd>

            <dt>Supporting evidence</dt>
            <dd>{evidence}</dd>

            <dt>Required personnel</dt>
            <dd>{action.metadata.requiredPersonnel}</dd>

            <dt>Required equipment</dt>
            <dd>{action.metadata.requiredEquipment ?? "None"}</dd>

            <dt>Affected zone</dt>
            <dd>{zoneName}</dd>

            <dt>Affected workers</dt>
            <dd>{workerCount !== undefined ? `${workerCount} present` : "Unknown"}</dd>

            <dt>Affected equipment</dt>
            <dd>
              {equipment && equipment.length > 0
                ? equipment.map((item) => `${item.equipment_type} (${item.isolation_status})`).join(", ")
                : "None recorded"}
            </dd>

            <dt>Affected permits</dt>
            <dd>
              {activePermitTypes.length > 0
                ? activePermitTypes.map(formatPermitType).join(", ")
                : "None active"}
            </dd>

            <dt>Replay timestamp</dt>
            <dd>{formatTimestamp(assessment.timestamp)}</dd>

            <dt>Counterfactual comparison</dt>
            <dd>
              {counterfactual
                ? explainComparison(counterfactual.compound, counterfactual.counterfactual, justification)
                : "Not available for this tick."}
            </dd>
          </dl>

          <p className="action-card-links">
            <Link to={`/explain/${assessment.assessment_id}`}>Decision Graph &rarr;</Link>{" "}
            <Link to={`/zones/${zoneId}`}>Zone detail &rarr;</Link>{" "}
            <Link to={`/digital-twin?zone=${zoneId}`}>Digital Twin &rarr;</Link>
          </p>
        </div>
      )}
    </li>
  );
}
