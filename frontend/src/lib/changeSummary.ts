import type { ForesightResult, IncidentMatch, RiskAssessment } from "../api/types";
import { parseJustification } from "./justification";
import { deriveRecommendations } from "./recommendations";

/**
 * M28 Part 6 (Executive Change Summary - "What Changed?") - a
 * tick-over-tick diff across the same six dimensions this platform
 * already computes elsewhere: risk (tier/score), historical match,
 * forecast early warning, permit escalation (`rules_fired`), worker
 * exposure (the Worker Exposure agent's own real risk contribution,
 * not a fabricated headcount history this platform doesn't persist),
 * and the top recommendation. Every comparison is between two
 * already-persisted/already-computed values - this file computes no
 * new risk, tier, or confidence, only whether two real values differ
 * by enough to be worth showing ("only meaningful changes").
 */

export interface ChangeSummaryEntry {
  label: string;
  before: string;
  after: string;
}

export interface ChangeSummaryInput {
  previousAssessment: RiskAssessment | null;
  currentAssessment: RiskAssessment;
  previousBestMatch?: IncidentMatch;
  currentBestMatch?: IncidentMatch;
  previousForesight?: ForesightResult;
  currentForesight?: ForesightResult;
}

const MEANINGFUL_SCORE_DELTA = 5;
const MEANINGFUL_SIMILARITY_DELTA = 0.05;
const MEANINGFUL_AGENT_RISK_DELTA = 5;
const PERMIT_ESCALATION_RULE = "permit_status_escalated";

export function buildChangeSummary(input: ChangeSummaryInput): ChangeSummaryEntry[] {
  const { previousAssessment, currentAssessment } = input;
  const entries: ChangeSummaryEntry[] = [];

  if (!previousAssessment) {
    return entries;
  }

  const tierChanged = previousAssessment.tier !== currentAssessment.tier;
  const scoreChanged =
    Math.abs(currentAssessment.compound_risk_score - previousAssessment.compound_risk_score) >=
    MEANINGFUL_SCORE_DELTA;
  if (tierChanged || scoreChanged) {
    entries.push({
      label: "Risk",
      before: `${previousAssessment.tier.toUpperCase()} (${previousAssessment.compound_risk_score.toFixed(1)})`,
      after: `${currentAssessment.tier.toUpperCase()} (${currentAssessment.compound_risk_score.toFixed(1)})`,
    });
  }

  const previousJustification = parseJustification(previousAssessment.justification);
  const currentJustification = parseJustification(currentAssessment.justification);

  const previousTopRec = deriveRecommendations(previousAssessment.tier, previousJustification)[0];
  const currentTopRec = deriveRecommendations(currentAssessment.tier, currentJustification)[0];
  if (previousTopRec?.id !== currentTopRec?.id) {
    entries.push({
      label: "Recommendation",
      before: previousTopRec?.text ?? "No recommended action",
      after: currentTopRec?.text ?? "No recommended action",
    });
  }

  const previousWorkerRisk = previousJustification?.agentContributions.worker_exposure?.risk;
  const currentWorkerRisk = currentJustification?.agentContributions.worker_exposure?.risk;
  if (
    previousWorkerRisk !== undefined &&
    currentWorkerRisk !== undefined &&
    Math.abs(currentWorkerRisk - previousWorkerRisk) >= MEANINGFUL_AGENT_RISK_DELTA
  ) {
    entries.push({
      label: "Worker Exposure",
      before: previousWorkerRisk.toFixed(1),
      after: currentWorkerRisk.toFixed(1),
    });
  }

  const previousPermitFlag = previousJustification?.rulesFired.includes(PERMIT_ESCALATION_RULE) ?? false;
  const currentPermitFlag = currentJustification?.rulesFired.includes(PERMIT_ESCALATION_RULE) ?? false;
  if (previousPermitFlag !== currentPermitFlag) {
    entries.push({
      label: "Permit",
      before: previousPermitFlag ? "Escalation flagged" : "No escalation",
      after: currentPermitFlag ? "Escalation flagged" : "No escalation",
    });
  }

  const nameChanged = input.previousBestMatch?.incident_name !== input.currentBestMatch?.incident_name;
  const similarityChanged =
    input.previousBestMatch !== undefined &&
    input.currentBestMatch !== undefined &&
    Math.abs(input.currentBestMatch.similarity - input.previousBestMatch.similarity) >=
      MEANINGFUL_SIMILARITY_DELTA;
  if (nameChanged || similarityChanged) {
    entries.push({
      label: "Historical",
      before: input.previousBestMatch
        ? `${input.previousBestMatch.incident_name} (${(input.previousBestMatch.similarity * 100).toFixed(0)}%)`
        : "No comparable incident",
      after: input.currentBestMatch
        ? `${input.currentBestMatch.incident_name} (${(input.currentBestMatch.similarity * 100).toFixed(0)}%)`
        : "No comparable incident",
    });
  }

  if (input.previousForesight?.early_warning.category !== input.currentForesight?.early_warning.category) {
    entries.push({
      label: "Forecast",
      before: input.previousForesight?.early_warning.category ?? "No forecast",
      after: input.currentForesight?.early_warning.category ?? "No forecast",
    });
  }

  return entries;
}
