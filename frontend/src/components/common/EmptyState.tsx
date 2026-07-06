import { Link } from "react-router-dom";

export interface EmptyStateAction {
  label: string;
  to: string;
}

interface EmptyStateProps {
  label: string;
  /** Part 7 (empty states) - why this is empty right now, in plain
   * language. Optional so existing callers that only pass `label`
   * keep working - this is additive richness, not a required prop. */
  hint?: string;
  /** A concrete next step, e.g. "Go to Scenario Library" ->
   * `/scenarios`. Never a fabricated action - only pass a real route
   * that actually populates this data. */
  action?: EmptyStateAction;
}

/** A generic "nothing here yet" glyph - an open inbox/tray, not tied
 * to any specific data type, since this component is shared by every
 * page's empty state. */
function EmptyIllustration() {
  return (
    <svg width="48" height="48" viewBox="-24 -24 48 48" aria-hidden="true" className="empty-state-illustration">
      <path
        d="M -18 -4 L -10 -18 L 10 -18 L 18 -4 L 18 14 C 18 16 16 18 14 18 L -14 18 C -16 18 -18 16 -18 14 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M -18 -4 L -6 -4 L -3 2 L 3 2 L 6 -4 L 18 -4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ label, hint, action }: EmptyStateProps) {
  return (
    <div className="state state-empty">
      <EmptyIllustration />
      <p className="state-empty-label">{label}</p>
      {hint && <p className="state-empty-hint">{hint}</p>}
      {action && (
        <Link to={action.to} className="state-empty-action">
          {action.label} &rarr;
        </Link>
      )}
    </div>
  );
}
