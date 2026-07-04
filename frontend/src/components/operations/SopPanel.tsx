import type { PrioritizedAction } from "../../lib/actionPlaybook";
import { getSopReference } from "../../lib/sopReferences";

/**
 * Item 5 (SOP Integration) - every currently-active recommendation
 * mapped to its configured plant SOP reference (title, standard,
 * section, summary, external-URL placeholder), read entirely from
 * `lib/sopReferences.ts`'s two JSON-shaped lookup tables - nothing is
 * hardcoded in this component, and a recommendation this platform
 * has no SOP configured for says so plainly rather than fabricating
 * a document number.
 */
export function SopPanel({
  actions,
  activePermitTypes,
}: {
  actions: PrioritizedAction[];
  activePermitTypes: string[];
}) {
  if (actions.length === 0) {
    return <p>No active recommendations to map to an SOP right now.</p>;
  }

  return (
    <ul className="sop-panel-list">
      {actions.map((action) => {
        const sop = getSopReference(action.id, activePermitTypes);
        return (
          <li key={action.id} className="sop-panel-item">
            <strong>{action.text}</strong>
            {sop ? (
              <>
                <p className="sop-panel-title">
                  {sop.title} &mdash; {sop.standard} ({sop.section})
                </p>
                <p className="sop-panel-summary">{sop.summary}</p>
                {sop.externalUrl ? (
                  <a href={sop.externalUrl} target="_blank" rel="noreferrer">
                    Open reference document &rarr;
                  </a>
                ) : (
                  <span className="sop-panel-no-link">No external document link configured.</span>
                )}
              </>
            ) : (
              <p className="sop-panel-none">No SOP reference configured for this recommendation.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
