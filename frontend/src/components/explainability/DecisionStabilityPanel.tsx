import type { RecommendationStability } from "../../lib/decisionStability";

function formatFactor(factor: RecommendationStability["historicalAgreement"]): string {
  if (!factor) {
    return "Unavailable";
  }
  if (factor.kind === "percentage") {
    return `${(factor.value * 100).toFixed(0)}%`;
  }
  if (factor.kind === "categorical") {
    return factor.categoryLabel;
  }
  return "Unavailable";
}

/**
 * M28 Part 2 (Decision Stability) - "how long has this recommendation
 * held, and why" instead of a single confidence number. Every value
 * is passed in already computed (`buildRecommendationStability`) -
 * this component only renders.
 */
export function DecisionStabilityPanel({ stability }: { stability: RecommendationStability }) {
  return (
    <div className="decision-stability">
      <dl className="decision-stability-grid">
        <div>
          <dt>Recommendation unchanged</dt>
          <dd>
            {stability.unchangedForTicks} replay tick{stability.unchangedForTicks === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt>Historical agreement</dt>
          <dd>{formatFactor(stability.historicalAgreement)}</dd>
        </div>
        <div>
          <dt>Forecast agreement</dt>
          <dd>{formatFactor(stability.forecastAgreement)}</dd>
        </div>
        <div>
          <dt>Oscillation</dt>
          <dd
            className={
              stability.oscillationDetected
                ? "decision-stability-oscillation-detected"
                : "decision-stability-oscillation-none"
            }
          >
            {stability.oscillationDetected
              ? `Detected (${stability.oscillationReversals} reversals)`
              : "No oscillation detected"}
          </dd>
        </div>
      </dl>
      <p className="kpi-sub">{stability.reason}</p>
    </div>
  );
}
