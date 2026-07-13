import type { ChangeSummaryEntry } from "../../lib/changeSummary";

/**
 * M28 Part 6 (Executive Change Summary - "What Changed?") - every
 * entry is passed in already computed (`buildChangeSummary`), already
 * filtered to only meaningful changes. This component only renders.
 */
export function ExecutiveChangeSummary({ entries }: { entries: ChangeSummaryEntry[] }) {
  if (entries.length === 0) {
    return <p className="kpi-sub">No meaningful change since the previous tick.</p>;
  }

  return (
    <ul className="change-summary-list">
      {entries.map((entry) => (
        <li key={entry.label} className="change-summary-entry">
          <span className="change-summary-label">{entry.label}</span>
          <span className="change-summary-before">{entry.before}</span>
          <span className="change-summary-arrow" aria-hidden="true">
            &rarr;
          </span>
          <span className="change-summary-after">{entry.after}</span>
        </li>
      ))}
    </ul>
  );
}
