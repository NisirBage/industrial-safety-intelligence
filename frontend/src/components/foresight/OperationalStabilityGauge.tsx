import type { EarlyWarningSignal, ForesightConfidence } from "../../api/types";

const POSITIONS: EarlyWarningSignal["category"][] = [
  "Potential Recovery",
  "Potential Stabilization",
  "Potential Escalation",
  "Potential Shutdown",
];

/**
 * M25 Part 9 (Operational stability gauge) - a deterministic 4-position
 * track (Recovery -> Stabilization -> Escalation -> Shutdown, increasing
 * severity left to right) with the current early-warning category
 * marked, alongside the overall forecast confidence. Not a new metric:
 * both values are read straight from `EarlyWarningSignal.category` and
 * `ForesightConfidence.overall`, already computed elsewhere.
 */
export function OperationalStabilityGauge({
  category,
  confidence,
}: {
  category: EarlyWarningSignal["category"];
  confidence: ForesightConfidence;
}) {
  const activeIndex = POSITIONS.indexOf(category);

  return (
    <div className="foresight-stability-gauge">
      <div className="foresight-stability-gauge-track">
        {POSITIONS.map((position, index) => (
          <div
            key={position}
            className={`foresight-stability-gauge-segment${index === activeIndex ? " foresight-stability-gauge-segment-active" : ""}`}
            title={position}
          />
        ))}
      </div>
      <div className="foresight-stability-gauge-labels">
        <span>Recovery</span>
        <span>Stabilization</span>
        <span>Escalation</span>
        <span>Shutdown</span>
      </div>
      <p className="kpi-sub">
        Confidence in this reading: {Math.round(confidence.overall * 100)}%
      </p>
    </div>
  );
}
