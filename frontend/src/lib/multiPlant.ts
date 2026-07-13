import type { ReplayData, RiskAssessment, ScenarioSummary } from "../api/types";
import { averageCompoundScore, isEscalation, plantReadiness, type PlantReadiness } from "./executiveKpis";
import { worstTier } from "./tier";

/**
 * M27 Part 5 (Multi-Plant Command Center) - this platform's real data
 * model has exactly one deck/plant (the same "one honest deck"
 * constraint M24 already established). Rather than fabricate
 * additional plants, each *existing, real* cataloged scenario stands
 * in for one facility card: every zone, sensor, tick, and risk
 * assessment referenced below is genuinely real, already-persisted
 * data - only the "this scenario = one plant" framing is a deliberate
 * reinterpretation for this enterprise rollup view, not new data.
 * Every number here is a re-derivation of an existing quantity
 * (`averageCompoundScore`, `worstTier`, `plantReadiness`,
 * `isEscalation` - all already used elsewhere in this app), never a
 * new computation.
 */

export interface PlantSummary {
  scenarioKey: string;
  title: string;
  description: string;
  zoneCount: number;
  tickCount: number;
  durationMinutes: number;
  worstTier: string | null;
  averageCompoundScore: number;
  incidentCount: number;
  readiness: PlantReadiness;
}

function allAssessments(replay: ReplayData): RiskAssessment[] {
  return replay.zone_timelines.flatMap((timeline) => timeline.assessments);
}

export function buildPlantSummary(scenario: ScenarioSummary, replay: ReplayData): PlantSummary {
  const assessments = allAssessments(replay);
  return {
    scenarioKey: scenario.key,
    title: scenario.title,
    description: scenario.description,
    zoneCount: replay.zone_ids.length,
    tickCount: replay.tick_count,
    durationMinutes: replay.duration_minutes,
    worstTier: worstTier(assessments.map((a) => a.tier)),
    averageCompoundScore: averageCompoundScore(assessments),
    incidentCount: assessments.filter(isEscalation).length,
    readiness: plantReadiness(assessments),
  };
}

export interface CorporateOverview {
  plantCount: number;
  totalZones: number;
  worstTier: string | null;
  averageCompoundScore: number;
  totalIncidents: number;
  readiness: PlantReadiness;
}

const READINESS_ORDER: PlantReadiness[] = ["ready", "degraded", "not_ready"];

/** The corporate rollup is a worst-of/sum-of aggregation over each
 * plant's own already-derived summary - never a recomputation from
 * raw ticks. */
export function buildCorporateOverview(summaries: PlantSummary[]): CorporateOverview {
  if (summaries.length === 0) {
    return {
      plantCount: 0,
      totalZones: 0,
      worstTier: null,
      averageCompoundScore: 0,
      totalIncidents: 0,
      readiness: "ready",
    };
  }
  const readiness = summaries.reduce<PlantReadiness>(
    (worst, summary) =>
      READINESS_ORDER.indexOf(summary.readiness) > READINESS_ORDER.indexOf(worst)
        ? summary.readiness
        : worst,
    "ready",
  );
  const tiers = summaries
    .map((summary) => summary.worstTier)
    .filter((tier): tier is string => tier !== null);

  return {
    plantCount: summaries.length,
    totalZones: summaries.reduce((sum, summary) => sum + summary.zoneCount, 0),
    worstTier: worstTier(tiers),
    averageCompoundScore:
      summaries.reduce((sum, summary) => sum + summary.averageCompoundScore, 0) / summaries.length,
    totalIncidents: summaries.reduce((sum, summary) => sum + summary.incidentCount, 0),
    readiness,
  };
}
