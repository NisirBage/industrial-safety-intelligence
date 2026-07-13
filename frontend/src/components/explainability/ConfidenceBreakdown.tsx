import type { ConfidenceFactor } from "../../lib/confidenceBreakdown";

/**
 * M27 Part 7 (Confidence Breakdown) - replaces a single confidence
 * percentage with the named factors behind it. Every row's value
 * traces to something already computed (see confidenceBreakdown.ts's
 * own docstring); "unavailable" is shown honestly rather than
 * inventing a number, and a categorical factor (Operational
 * Stability) is shown as its real category, never forced into a
 * percentage it doesn't have.
 */
export function ConfidenceBreakdown({ factors }: { factors: ConfidenceFactor[] }) {
  return (
    <ul className="confidence-breakdown">
      {factors.map((factor) => (
        <li key={factor.label} className="confidence-breakdown-row">
          <div className="confidence-breakdown-header">
            <span className="confidence-breakdown-label">{factor.label}</span>
            {factor.kind === "percentage" && (
              <span className="confidence-breakdown-value">{(factor.value * 100).toFixed(0)}%</span>
            )}
            {factor.kind === "categorical" && (
              <span className="confidence-breakdown-category">{factor.categoryLabel}</span>
            )}
            {factor.kind === "unavailable" && (
              <span className="confidence-breakdown-unavailable">Unavailable</span>
            )}
          </div>
          {factor.kind === "percentage" && (
            <div className="confidence-breakdown-bar-track">
              <div
                className="confidence-breakdown-bar-fill"
                style={{ width: `${Math.round(factor.value * 100)}%` }}
              />
            </div>
          )}
          <p className="confidence-breakdown-source">
            {factor.kind === "unavailable" ? factor.reason : factor.source}
          </p>
        </li>
      ))}
    </ul>
  );
}
