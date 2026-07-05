import type { CounterfactualComparison, EquipmentInfo, RiskAssessment } from "../../api/types";
import type { PrioritizedAction } from "../../lib/actionPlaybook";
import type { RiskJustification } from "../../lib/justification";
import { ActionCard } from "./ActionCard";

/**
 * Item 2 (Prioritized Action Queue) - renders one expandable
 * `ActionCard` per already-built `PrioritizedAction` (the page builds
 * the queue once via `buildActionQueue` and shares it with the
 * Operational Dependency Graph/Impact Explorer/SOP panel too, so
 * every view of "the current actions" reads the exact same list -
 * this component never re-derives or re-orders anything itself).
 */
export function ActionQueue({
  actions,
  zoneId,
  zoneName,
  assessment,
  justification,
  counterfactual,
  workerCount,
  activePermitTypes,
  equipment,
  onFocusZone,
  autoExpandFirst = false,
}: {
  actions: PrioritizedAction[];
  zoneId: string;
  zoneName: string;
  assessment: RiskAssessment;
  justification: RiskJustification | null;
  counterfactual: CounterfactualComparison | undefined;
  workerCount: number | undefined;
  activePermitTypes: string[];
  equipment: EquipmentInfo[] | undefined;
  onFocusZone?: (zoneId: string) => void;
  autoExpandFirst?: boolean;
}) {
  if (actions.length === 0) {
    return <p>No recommended actions right now - this zone is at NORMAL.</p>;
  }

  return (
    <ol className="action-queue">
      {actions.map((action, index) => (
        <ActionCard
          key={action.id}
          action={action}
          zoneId={zoneId}
          zoneName={zoneName}
          assessment={assessment}
          justification={justification}
          counterfactual={counterfactual}
          workerCount={workerCount}
          activePermitTypes={activePermitTypes}
          equipment={equipment}
          onFocusZone={onFocusZone}
          defaultExpanded={autoExpandFirst && index === 0}
        />
      ))}
    </ol>
  );
}
