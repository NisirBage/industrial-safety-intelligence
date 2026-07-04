import type { CompoundVerdict, CounterfactualVerdict } from "../api/types";
import type { RiskJustification } from "./justification";

export interface ComparisonMoment {
  zoneId: string;
  timestamp: string;
  compound: CompoundVerdict | null;
  counterfactual: CounterfactualVerdict;
}

/**
 * Item 6 (decision comparison) - "the strongest demonstration page"
 * needs one real moment per scenario, not an average or a synthetic
 * example. Prefers a genuine miss (compound engine escalated, naive
 * baseline stayed clear) with the highest compound score among misses
 * - the single most dramatic real divergence available. Falls back to
 * the highest-scoring moment with a persisted compound verdict when a
 * scenario has no divergence at all, so the page never fabricates one.
 */
export function pickComparisonMoment(moments: ComparisonMoment[]): ComparisonMoment | null {
  const withCompound = moments.filter(
    (moment): moment is ComparisonMoment & { compound: CompoundVerdict } => moment.compound !== null,
  );
  if (withCompound.length === 0) {
    return null;
  }

  const misses = withCompound.filter(
    (moment) => moment.compound.tier !== "normal" && !moment.counterfactual.alert,
  );
  const pool = misses.length > 0 ? misses : withCompound;

  return pool.reduce((best, current) =>
    current.compound.compound_risk_score > best.compound!.compound_risk_score ? current : best,
  );
}

/** Grounded entirely in fields the two independent systems already
 * computed - the interaction bonus Fusion actually applied, or the
 * naive baseline's own highest sensor/threshold ratio. Never invents
 * a number; picks which already-true fact best explains the gap. */
export function explainComparison(
  compound: CompoundVerdict | null,
  counterfactual: CounterfactualVerdict,
  justification: RiskJustification | null,
): string {
  if (!compound) {
    return "No persisted compound assessment exists for this exact tick.";
  }
  const misses = compound.tier !== "normal" && !counterfactual.alert;
  if (!misses) {
    return "Both systems agree at this tick - no divergence to explain.";
  }
  if (justification && justification.rulesFired.includes("interaction_bonus_applied")) {
    return (
      `Fusion multiplied the base risk by a ${justification.interactionBonusApplied.toFixed(2)}x ` +
      "interaction bonus - multiple independent risk factors (e.g. a live permit alongside a rising " +
      "sensor reading) are active at once, something a single-sensor threshold has no concept of."
    );
  }
  if (counterfactual.highest_ratio !== null) {
    return (
      `The naive baseline's highest sensor reading was still only ${(counterfactual.highest_ratio * 100).toFixed(0)}% ` +
      "of its hard alarm threshold, so it stays clear. The compound engine's saturating risk curve, " +
      "cross-agent fusion, and tiering hysteresis together already classify this as elevated - it doesn't " +
      "need a sensor to cross 100% of one threshold to recognize danger."
    );
  }
  return "The naive baseline has no sensor data to evaluate, so it defaults to clear by construction.";
}
