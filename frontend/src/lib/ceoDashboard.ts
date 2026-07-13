import type { IncidentMatch, RiskAssessment } from "../api/types";
import type { PrioritizedAction } from "./actionPlaybook";
import { businessStoryLine } from "./executiveExplanation";
import type { RiskJustification } from "./justification";
import type { Recommendation } from "./recommendations";

/**
 * M27 Part 9 (Executive/CEO Mode) - one screen, plain business
 * language, zero new computation. Every field below is a rewording of
 * a value this platform already computed elsewhere:
 *  - currentSituation reuses `businessStoryLine` (M23 Part 6) verbatim.
 *  - businessRisk/operationalRisk are two different plain-language
 *    labels for the exact same real `tier` - never a second score.
 *  - estimatedDowntime is deliberately NOT a fabricated number: the
 *    deterministic engine has no downtime model. It reuses the closest
 *    historical incident's own `business_impact` narrative when one
 *    exists (Historical Intelligence, M24), honestly labeled as such,
 *    and says so plainly when no historical match is available -
 *    the same "Unavailable" discipline BusinessImpact/ConfidenceBreakdown
 *    already established, rather than inventing a number.
 *  - recommendedDecision/expectedOutcome reuse the top item from
 *    `deriveRecommendations`/`buildActionQueue` (Operations Center,
 *    M17-18) - the same "what to do next" this platform already shows
 *    engineers, just without the rule-id/agent-name vocabulary.
 */

export type BusinessRiskLevel = "Severe" | "Significant" | "Moderate" | "Low";

interface BusinessRiskEntry {
  level: BusinessRiskLevel;
  description: string;
}

const BUSINESS_RISK_BY_TIER: Record<string, BusinessRiskEntry> = {
  critical: {
    level: "Severe",
    description: "Could halt operations and carry significant financial and reputational impact.",
  },
  elevated: {
    level: "Significant",
    description: "Business disruption is likely if this is not addressed soon.",
  },
  watch: {
    level: "Moderate",
    description: "Close monitoring is warranted; no disruption expected yet.",
  },
  normal: {
    level: "Low",
    description: "Normal operations; no business impact expected.",
  },
};

export interface EstimatedDowntime {
  text: string;
  sourced: boolean;
}

export interface CeoDashboardData {
  currentSituation: string;
  businessRisk: BusinessRiskEntry;
  operationalRiskLabel: string;
  operationalRiskScore: number;
  estimatedDowntime: EstimatedDowntime;
  workersAffected: number;
  recommendedDecision: string;
  confidencePercent: number;
  expectedOutcome: string;
}

function estimatedDowntime(bestMatch: IncidentMatch | undefined): EstimatedDowntime {
  if (!bestMatch) {
    return {
      text: "Not available - no comparable historical incident to estimate from.",
      sourced: false,
    };
  }
  return { text: bestMatch.business_impact, sourced: true };
}

export function buildCeoDashboard(
  assessment: RiskAssessment,
  justification: RiskJustification | null,
  recommendations: Recommendation[],
  topAction: PrioritizedAction | undefined,
  workersAffected: number,
  bestHistoricalMatch: IncidentMatch | undefined,
): CeoDashboardData {
  const businessRisk = BUSINESS_RISK_BY_TIER[assessment.tier] ?? BUSINESS_RISK_BY_TIER.normal;

  return {
    currentSituation: businessStoryLine(assessment, justification),
    businessRisk,
    operationalRiskLabel: assessment.tier.toUpperCase(),
    operationalRiskScore: assessment.compound_risk_score,
    estimatedDowntime: estimatedDowntime(bestHistoricalMatch),
    workersAffected,
    recommendedDecision: recommendations[0]?.text ?? "No action required - continue normal operations.",
    confidencePercent: Math.round(assessment.confidence * 100),
    expectedOutcome: topAction
      ? `Following this recommendation is expected to have a ${topAction.impactLevel.toLowerCase()} impact on reducing risk.`
      : "No open recommendation - risk is not currently expected to change.",
  };
}
