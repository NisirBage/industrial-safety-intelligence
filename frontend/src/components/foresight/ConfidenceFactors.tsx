import type { ForesightConfidence } from "../../api/types";

const FACTOR_LABELS: { key: keyof Omit<ForesightConfidence, "overall">; label: string }[] = [
  { key: "historical_agreement", label: "Historical agreement" },
  { key: "data_completeness", label: "Data completeness" },
  { key: "trajectory_similarity", label: "Trajectory similarity" },
  { key: "replay_coverage", label: "Replay coverage" },
];

/**
 * M25 Part 5/9 (Confidence, displayed visually) - four independently
 * computed factors as horizontal meters, plus the overall figure
 * (`min()` of the four, never an average - see
 * src/foresight/confidence.py). Every percentage is a real computed
 * value, not a fabricated one.
 */
export function ConfidenceFactors({ confidence }: { confidence: ForesightConfidence }) {
  return (
    <div className="foresight-confidence-factors">
      {FACTOR_LABELS.map(({ key, label }) => {
        const value = confidence[key];
        return (
          <div key={key} className="foresight-confidence-row">
            <span className="foresight-confidence-label">{label}</span>
            <div className="foresight-confidence-meter">
              <div
                className="foresight-confidence-meter-fill"
                style={{ width: `${Math.round(value * 100)}%` }}
              />
            </div>
            <span className="foresight-confidence-value">{Math.round(value * 100)}%</span>
          </div>
        );
      })}
      <div className="foresight-confidence-overall">
        Overall confidence: <strong>{Math.round(confidence.overall * 100)}%</strong>
        <span className="kpi-sub"> (weakest factor - never an average)</span>
      </div>
    </div>
  );
}
