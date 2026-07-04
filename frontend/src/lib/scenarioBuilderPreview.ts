import type { ScenarioDefinitionDraft } from "../api/types";

export interface ScenarioSummary {
  sensorEventCount: number;
  permitEventCount: number;
  /** Latest (sim_time + duration_minutes) across every event - the
   * scenario's own implied length, not a fixed window. */
  totalDurationMinutes: number;
  affectedZoneIds: string[];
  curveTypes: string[];
  permitTypes: string[];
}

/** Pure derivation from a draft - every number here is a count, max,
 * or set-of-values already present in the draft, never a risk
 * computation. Powers the Scenario Builder's Preview panel. */
export function summarizeScenario(draft: ScenarioDefinitionDraft): ScenarioSummary {
  const ends = [
    ...draft.sensor_events.map((e) => e.sim_time + e.duration_minutes),
    ...draft.permit_events.map((e) => e.sim_time + e.duration_minutes),
  ];

  return {
    sensorEventCount: draft.sensor_events.length,
    permitEventCount: draft.permit_events.length,
    totalDurationMinutes: ends.length > 0 ? Math.max(...ends) : 0,
    affectedZoneIds: [
      ...new Set([
        ...draft.sensor_events.map((e) => e.zone_id),
        ...draft.permit_events.map((e) => e.zone_id),
      ]),
    ],
    curveTypes: [...new Set(draft.sensor_events.map((e) => e.curve))],
    permitTypes: [...new Set(draft.permit_events.map((e) => e.permit_type))],
  };
}

export interface SequenceStep {
  kind: "sensor" | "permit";
  name: string;
  zoneId: string;
  simTime: number;
  durationMinutes: number;
}

/** Every event, sensor and permit combined, ordered by when it
 * starts - the Preview panel's "expected sequence" list. */
export function buildExpectedSequence(draft: ScenarioDefinitionDraft): SequenceStep[] {
  const steps: SequenceStep[] = [
    ...draft.sensor_events.map((e) => ({
      kind: "sensor" as const,
      name: e.name,
      zoneId: e.zone_id,
      simTime: e.sim_time,
      durationMinutes: e.duration_minutes,
    })),
    ...draft.permit_events.map((e) => ({
      kind: "permit" as const,
      name: e.name,
      zoneId: e.zone_id,
      simTime: e.sim_time,
      durationMinutes: e.duration_minutes,
    })),
  ];
  return steps.sort((a, b) => a.simTime - b.simTime);
}
