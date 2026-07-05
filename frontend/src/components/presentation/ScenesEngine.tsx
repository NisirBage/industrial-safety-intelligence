import type { CounterfactualComparison, EquipmentInfo, RiskAssessment, Zone } from "../../api/types";
import { PipelineDiagram } from "../explainability/PipelineDiagram";
import { ActionQueue } from "../operations/ActionQueue";
import { OperationalDependencyGraph } from "../operations/OperationalDependencyGraph";
import { OperationalImpactExplorer } from "../operations/OperationalImpactExplorer";
import { OperatorTimeline, type TimelineEntry } from "../operations/OperatorTimeline";
import { TierBadge } from "../common/TierBadge";
import type { PrioritizedAction } from "../../lib/actionPlaybook";
import { zoneLabel } from "../../lib/format";
import { hasInteractionBonus, isIgnoredByThresholdEngine } from "../../lib/rootCause";
import type { RiskJustification } from "../../lib/justification";
import { computeRelativeShares } from "../../lib/presentationScript";

/** Scene 4 - the deterministic pipeline itself, reusing the exact
 * `PipelineDiagram` the Decision Graph milestone built. Every value
 * inside it is the real persisted `justification` for the peak tick
 * of the replayed scenario - nothing is re-created for the demo. */
export function Scene4Pipeline({
  assessment,
  justification,
}: {
  assessment: RiskAssessment | undefined;
  justification: RiskJustification | null;
}) {
  return (
    <div className="scene scene-pipeline">
      <h2 className="scene-heading">AI Decision Engine</h2>
      {assessment ? (
        <PipelineDiagram assessment={assessment} justification={justification} />
      ) : (
        <p>No replay data available.</p>
      )}
    </div>
  );
}

/** Scene 5 - the same peak tick's agent contributions, shown as each
 * agent's share of this tick's total raw risk
 * (`lib/presentationScript.ts::computeRelativeShares` - explicitly a
 * normalization of real numbers, never the real Fusion weight, which
 * no endpoint exposes), plus which factor is structurally invisible
 * to the naive Counterfactual engine and whether an interaction bonus
 * actually applied this tick. */
export function Scene5DecisionGraph({ justification }: { justification: RiskJustification | null }) {
  const shares = computeRelativeShares(justification);
  const bonusApplied = hasInteractionBonus(justification);

  return (
    <div className="scene scene-decision-graph">
      <h2 className="scene-heading">Decision Graph</h2>
      {shares.length === 0 ? (
        <p>No structured justification available for this tick.</p>
      ) : (
        <>
          <ul className="scene-influence-list">
            {shares.map((share, index) => (
              <li key={share.agentName} className={index === 0 ? "scene-influence-top" : undefined}>
                <strong>{share.displayName}</strong> &mdash; {share.risk.toFixed(1)} risk (
                {share.sharePercent.toFixed(0)}% of this tick&apos;s total raw contribution)
                {index === 0 && " — largest contributor"}
                {isIgnoredByThresholdEngine(share.agentName) && " · invisible to the naive baseline"}
              </li>
            ))}
          </ul>
          <p className="scene-interaction-bonus">
            {bonusApplied
              ? `Interaction bonus applied - multiple independent factors are compounding at once (rule: interaction_bonus_applied).`
              : "No interaction bonus this tick - factors are not compounding."}
          </p>
        </>
      )}
    </div>
  );
}

/** Scene 6 - the Operations Center's own components, reused wholesale
 * (Action Queue, Operational Dependency Graph, Operator Timeline,
 * Operational Impact Explorer), with the top-priority action
 * auto-expanded so nothing needs a click during the guided tour. */
export function Scene6Operations({
  actions,
  zoneId,
  zones,
  assessment,
  justification,
  counterfactual,
  workerCount,
  activePermitTypes,
  equipment,
  timelineEntries,
}: {
  actions: PrioritizedAction[];
  zoneId: string;
  zones: Zone[] | undefined;
  assessment: RiskAssessment | undefined;
  justification: RiskJustification | null;
  counterfactual: CounterfactualComparison | undefined;
  workerCount: number | undefined;
  activePermitTypes: string[];
  equipment: EquipmentInfo[] | undefined;
  timelineEntries: TimelineEntry[];
}) {
  if (!assessment) {
    return (
      <div className="scene scene-operations">
        <h2 className="scene-heading">Operations Center</h2>
        <p>No replay data available.</p>
      </div>
    );
  }

  return (
    <div className="scene scene-operations">
      <h2 className="scene-heading">
        Operations Center &mdash; {zoneLabel(zoneId, zones)} <TierBadge tier={assessment.tier} />
      </h2>
      <div className="scene-operations-grid">
        <div>
          <h3>Action Queue</h3>
          <ActionQueue
            actions={actions}
            zoneId={zoneId}
            zoneName={zoneLabel(zoneId, zones)}
            assessment={assessment}
            justification={justification}
            counterfactual={counterfactual}
            workerCount={workerCount}
            activePermitTypes={activePermitTypes}
            equipment={equipment}
            autoExpandFirst
          />
        </div>
        <div>
          <h3>Dependency Graph</h3>
          <OperationalDependencyGraph actions={actions} />
          <h3>Impact Explorer</h3>
          <OperationalImpactExplorer actions={actions} justification={justification} />
          <h3>Timeline</h3>
          <OperatorTimeline entries={timelineEntries} />
        </div>
      </div>
    </div>
  );
}
