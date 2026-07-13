import type { RiskAssessment } from "../api/types";
import type { ConfidenceFactor } from "./confidenceBreakdown";
import { parseJustification } from "./justification";
import { deriveRecommendations } from "./recommendations";
import { tierRank } from "./tier";

/**
 * M28 Part 2 (Decision Stability) - replaces "here's a single
 * confidence number" with "here's why the recommendation has stayed
 * the same." Every value here is derived from already-persisted
 * `RiskAssessment` rows (tier, justification) or the existing
 * `ConfidenceFactor[]` this app already computes
 * (`buildConfidenceBreakdown`, M27 Part 7) - nothing here recomputes
 * risk, tier, confidence, or a forecast.
 */

export interface RecommendationStability {
  unchangedForTicks: number;
  oscillationDetected: boolean;
  oscillationReversals: number;
  historicalAgreement: ConfidenceFactor | null;
  forecastAgreement: ConfidenceFactor | null;
  reason: string;
}

function topRecommendationId(assessment: RiskAssessment): string | null {
  const justification = parseJustification(assessment.justification);
  const recommendations = deriveRecommendations(assessment.tier, justification);
  return recommendations[0]?.id ?? null;
}

/** How many of the most recent ticks (newest first, e.g. `getRiskHistory`'s
 * own ordering) share the same top recommendation as the latest tick.
 * A tick with no recommendation counts as its own distinct "id" (null),
 * so "recommendation unchanged" never silently includes a tick where
 * there was no recommendation to compare. */
export function countUnchangedRecommendationTicks(timelineNewestFirst: RiskAssessment[]): number {
  if (timelineNewestFirst.length === 0) {
    return 0;
  }
  const latestId = topRecommendationId(timelineNewestFirst[0]);
  let count = 0;
  for (const assessment of timelineNewestFirst) {
    if (topRecommendationId(assessment) !== latestId) {
      break;
    }
    count++;
  }
  return count;
}

/** A "reversal" is the tier's severity direction changing (e.g. rising
 * then falling, or falling then rising) - flat ticks (no rank change)
 * don't count as a direction of their own. Two or more reversals means
 * the tier is genuinely flapping back and forth, not just a single
 * escalation followed by one cool-down (which is normal operation, not
 * oscillation). This threshold is a presentation choice, not a new risk
 * computation - it never feeds back into tier, confidence, or any
 * recommendation. */
export function detectOscillation(timelineNewestFirst: RiskAssessment[]): {
  detected: boolean;
  reversals: number;
} {
  const ascending = [...timelineNewestFirst].reverse();
  const ranks = ascending.map((assessment) => tierRank(assessment.tier));

  let reversals = 0;
  let lastDirection = 0;
  for (let i = 1; i < ranks.length; i++) {
    const diff = ranks[i] - ranks[i - 1];
    const direction = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (direction !== 0) {
      if (lastDirection !== 0 && direction !== lastDirection) {
        reversals++;
      }
      lastDirection = direction;
    }
  }
  return { detected: reversals >= 2, reversals };
}

function findFactor(factors: ConfidenceFactor[], label: string): ConfidenceFactor | null {
  return factors.find((factor) => factor.label === label) ?? null;
}

function describeFactor(factor: ConfidenceFactor | null): string {
  if (!factor) {
    return "unavailable";
  }
  if (factor.kind === "percentage") {
    return `${(factor.value * 100).toFixed(0)}%`;
  }
  if (factor.kind === "categorical") {
    return factor.categoryLabel;
  }
  return "unavailable";
}

export function buildRecommendationStability(
  timelineNewestFirst: RiskAssessment[],
  confidenceFactors: ConfidenceFactor[],
): RecommendationStability {
  const unchangedForTicks = countUnchangedRecommendationTicks(timelineNewestFirst);
  const oscillation = detectOscillation(timelineNewestFirst);
  const historicalAgreement = findFactor(confidenceFactors, "Historical Agreement");
  const forecastAgreement = findFactor(confidenceFactors, "Forecast Agreement");

  const reason =
    unchangedForTicks > 1
      ? `The tier and top recommendation have held steady for ${unchangedForTicks} consecutive ticks, ` +
        `with ${describeFactor(historicalAgreement)} historical agreement and ` +
        `${describeFactor(forecastAgreement)} forecast agreement over that window` +
        `${oscillation.detected ? ", despite some back-and-forth in severity" : " and no oscillation"}.`
      : "This is the first tick at this recommendation - no stability history yet.";

  return {
    unchangedForTicks,
    oscillationDetected: oscillation.detected,
    oscillationReversals: oscillation.reversals,
    historicalAgreement,
    forecastAgreement,
    reason,
  };
}
