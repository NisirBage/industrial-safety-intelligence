import type { ForesightResult, IncidentMatch, RiskAssessment } from "../api/types";
import type { RiskJustification } from "./justification";

/**
 * M27 Part 7 (Confidence Breakdown) - decomposes the single
 * `RiskAssessment.confidence` number into named factors, every one
 * traceable to a value some earlier milestone already computed. This
 * file computes NOTHING new: no factor here is a formula this
 * milestone invented - each is either copied directly from an
 * existing field (`ForesightConfidence`'s own four real factors, a
 * historical match's own `similarity`, an agent's own `confidence`)
 * or, where the underlying data is genuinely categorical rather than
 * numeric (Operational Stability), rendered as that real category
 * rather than a fabricated percentage.
 */

export type ConfidenceFactor =
  | { label: string; kind: "percentage"; value: number; source: string }
  | { label: string; kind: "categorical"; categoryLabel: string; source: string }
  | { label: string; kind: "unavailable"; reason: string };

const MISSING_OR_STALE_RULES = new Set(["missing_data_fail_safe", "stale_data_fail_safe"]);

export function buildConfidenceBreakdown(
  assessment: RiskAssessment,
  justification: RiskJustification | null,
  bestHistoricalMatch: IncidentMatch | undefined,
  foresight: ForesightResult | undefined,
): ConfidenceFactor[] {
  const factors: ConfidenceFactor[] = [];

  factors.push({
    label: "Overall",
    kind: "percentage",
    value: assessment.confidence,
    source: "RiskAssessment.confidence - Fusion's minimum-across-agents aggregation.",
  });

  if (foresight) {
    factors.push({
      label: "Historical Agreement",
      kind: "percentage",
      value: foresight.confidence.historical_agreement,
      source: "Operational Foresight's own confidence model (historical_agreement).",
    });
  } else if (bestHistoricalMatch) {
    factors.push({
      label: "Historical Agreement",
      kind: "percentage",
      value: bestHistoricalMatch.similarity,
      source: `Historical Intelligence similarity score to "${bestHistoricalMatch.incident_name}".`,
    });
  } else {
    factors.push({
      label: "Historical Agreement",
      kind: "unavailable",
      reason: "No historical match found for this tick.",
    });
  }

  const gasRiskConfidence = justification?.agentContributions.gas_risk?.confidence;
  if (gasRiskConfidence !== undefined) {
    factors.push({
      label: "Sensor Quality",
      kind: "percentage",
      value: gasRiskConfidence,
      source: "Gas Risk agent's own confidence this tick.",
    });
  } else {
    factors.push({
      label: "Sensor Quality",
      kind: "unavailable",
      reason: "Gas Risk did not contribute to this assessment.",
    });
  }

  if (foresight) {
    factors.push({
      label: "Data Completeness",
      kind: "percentage",
      value: foresight.confidence.data_completeness,
      source: "Operational Foresight's own confidence model (data_completeness).",
    });
  } else if (justification) {
    const missingOrStale = justification.rulesFired.some((rule) => MISSING_OR_STALE_RULES.has(rule));
    if (!missingOrStale) {
      factors.push({
        label: "Data Completeness",
        kind: "percentage",
        value: 1,
        source: "No missing/stale-data rule fired this tick.",
      });
    } else if (gasRiskConfidence !== undefined) {
      factors.push({
        label: "Data Completeness",
        kind: "percentage",
        value: gasRiskConfidence,
        source: "Gas Risk's own confidence under its missing/stale-data fail-safe.",
      });
    } else {
      factors.push({
        label: "Data Completeness",
        kind: "unavailable",
        reason: "A missing/stale-data rule fired but no agent confidence is available to trace it to.",
      });
    }
  } else {
    factors.push({
      label: "Data Completeness",
      kind: "unavailable",
      reason: "No justification recorded for this tick.",
    });
  }

  if (foresight) {
    factors.push({
      label: "Forecast Agreement",
      kind: "percentage",
      value: foresight.confidence.trajectory_similarity,
      source: "Operational Foresight's own confidence model (trajectory_similarity).",
    });
  } else {
    factors.push({
      label: "Forecast Agreement",
      kind: "unavailable",
      reason: "No forecast computed for this tick.",
    });
  }

  if (foresight) {
    factors.push({
      label: "Operational Stability",
      kind: "categorical",
      categoryLabel: foresight.early_warning.category,
      source: "Operational Foresight's early-warning signal (categorical, not a percentage).",
    });
  } else {
    factors.push({
      label: "Operational Stability",
      kind: "unavailable",
      reason: "No forecast computed for this tick.",
    });
  }

  return factors;
}
