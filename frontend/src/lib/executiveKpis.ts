import type { RiskAssessment } from "../api/types";
import { parseJustification } from "./justification";

/** Independent copy, same discipline as `lib/tier.ts`'s own -
 * severity ordering for display/comparison only. */
const TIER_ORDER = ["normal", "watch", "elevated", "critical"] as const;

/** An assessment "escalated" this tick if its own persisted
 * `tier_before`/`tier_after` moved to a more severe tier - copied
 * straight out of the justification Justification Builder already
 * wrote, never re-derived from a raw score. */
export function isEscalation(assessment: RiskAssessment): boolean {
  const justification = parseJustification(assessment.justification);
  if (!justification) {
    return false;
  }
  const beforeIndex = TIER_ORDER.indexOf(justification.tierBefore as (typeof TIER_ORDER)[number]);
  const afterIndex = TIER_ORDER.indexOf(justification.tierAfter as (typeof TIER_ORDER)[number]);
  return beforeIndex !== -1 && afterIndex !== -1 && afterIndex > beforeIndex;
}

export function isSameCalendarDay(isoTimestamp: string, referenceDate: Date): boolean {
  const d = new Date(isoTimestamp);
  return (
    d.getFullYear() === referenceDate.getFullYear() &&
    d.getMonth() === referenceDate.getMonth() &&
    d.getDate() === referenceDate.getDate()
  );
}

/** "Today's Incidents" - escalations (not just any non-normal
 * reading) recorded on the given calendar day, across all zones. */
export function countTodaysIncidents(assessments: RiskAssessment[], today: Date): number {
  return assessments.filter(
    (assessment) => isSameCalendarDay(assessment.timestamp, today) && isEscalation(assessment),
  ).length;
}

export function averageCompoundScore(assessments: RiskAssessment[]): number {
  if (assessments.length === 0) {
    return 0;
  }
  return assessments.reduce((sum, a) => sum + a.compound_risk_score, 0) / assessments.length;
}

export type PlantReadiness = "ready" | "degraded" | "not_ready";

/** M12.5 (Plant Readiness) - a deterministic label over the plant's
 * own already-computed tiers, not a new risk model: "not_ready" if
 * any zone is critical, "degraded" if any zone is watch/elevated,
 * "ready" only when every reporting zone is normal. */
export function plantReadiness(assessments: RiskAssessment[]): PlantReadiness {
  if (assessments.some((assessment) => assessment.tier === "critical")) {
    return "not_ready";
  }
  if (assessments.some((assessment) => assessment.tier === "watch" || assessment.tier === "elevated")) {
    return "degraded";
  }
  return "ready";
}

/** Share of reporting zones currently at NORMAL, as a percentage -
 * 100 when there are no zones to report (nothing outstanding). */
export function percentZonesNormal(assessments: RiskAssessment[]): number {
  if (assessments.length === 0) {
    return 100;
  }
  const normalCount = assessments.filter((assessment) => assessment.tier === "normal").length;
  return (normalCount / assessments.length) * 100;
}

export interface ZoneAssessment {
  zoneId: string;
  assessment: RiskAssessment;
}

/** The zone with the single highest compound_risk_score right now -
 * `null` only when there is nothing to compare. */
export function highestRiskZone(entries: ZoneAssessment[]): ZoneAssessment | null {
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce((max, current) =>
    current.assessment.compound_risk_score > max.assessment.compound_risk_score ? current : max,
  );
}
