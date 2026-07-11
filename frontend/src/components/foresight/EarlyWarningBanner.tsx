import type { EarlyWarningSignal } from "../../api/types";

const CATEGORY_CLASS: Record<EarlyWarningSignal["category"], string> = {
  "Potential Recovery": "foresight-early-warning-recovery",
  "Potential Stabilization": "foresight-early-warning-stabilization",
  "Potential Escalation": "foresight-early-warning-escalation",
  "Potential Shutdown": "foresight-early-warning-shutdown",
};

/**
 * M25 Part 7 (Early Warning) - one of exactly four categories,
 * displaying "why" (the supporting-match citation) prominently, never
 * just the bare category label.
 */
export function EarlyWarningBanner({ signal }: { signal: EarlyWarningSignal }) {
  return (
    <div className={`foresight-early-warning ${CATEGORY_CLASS[signal.category]}`}>
      <strong>{signal.category}</strong>
      <p>{signal.why}</p>
    </div>
  );
}
