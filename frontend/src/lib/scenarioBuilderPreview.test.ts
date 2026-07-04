import { describe, expect, it } from "vitest";

import type { ScenarioDefinitionDraft } from "../api/types";
import { buildExpectedSequence, summarizeScenario } from "./scenarioBuilderPreview";

function draft(overrides: Partial<ScenarioDefinitionDraft> = {}): ScenarioDefinitionDraft {
  return {
    title: "t",
    description: "",
    seed: 1,
    start_time: "2026-01-01T00:00:00Z",
    sensor_events: [],
    permit_events: [],
    ...overrides,
  };
}

describe("summarizeScenario", () => {
  it("returns zeroed counts for an empty draft", () => {
    expect(summarizeScenario(draft())).toEqual({
      sensorEventCount: 0,
      permitEventCount: 0,
      totalDurationMinutes: 0,
      affectedZoneIds: [],
      curveTypes: [],
      permitTypes: [],
    });
  });

  it("computes total duration as the latest sim_time + duration_minutes", () => {
    const summary = summarizeScenario(
      draft({
        sensor_events: [
          {
            name: "s1",
            zone_id: "z1",
            gas_type: "CH4",
            sim_time: 0,
            duration_minutes: 10,
            sample_interval_minutes: 5,
            curve: "linear_ramp",
            params: {},
          },
        ],
        permit_events: [
          {
            name: "p1",
            zone_id: "z2",
            sim_time: 20,
            permit_type: "hot_work",
            authorizing_officer_id: "w1",
            duration_minutes: 60,
          },
        ],
      }),
    );
    expect(summary.totalDurationMinutes).toBe(80); // 20 + 60
    expect(summary.affectedZoneIds).toEqual(["z1", "z2"]);
    expect(summary.sensorEventCount).toBe(1);
    expect(summary.permitEventCount).toBe(1);
  });

  it("deduplicates zone ids, curve types, and permit types", () => {
    const summary = summarizeScenario(
      draft({
        sensor_events: [
          {
            name: "s1",
            zone_id: "z1",
            gas_type: "CH4",
            sim_time: 0,
            duration_minutes: 10,
            sample_interval_minutes: 5,
            curve: "linear_ramp",
            params: {},
          },
          {
            name: "s2",
            zone_id: "z1",
            gas_type: "CH4",
            sim_time: 0,
            duration_minutes: 10,
            sample_interval_minutes: 5,
            curve: "linear_ramp",
            params: {},
          },
        ],
      }),
    );
    expect(summary.affectedZoneIds).toEqual(["z1"]);
    expect(summary.curveTypes).toEqual(["linear_ramp"]);
  });
});

describe("buildExpectedSequence", () => {
  it("orders sensor and permit events together by sim_time", () => {
    const sequence = buildExpectedSequence(
      draft({
        sensor_events: [
          {
            name: "later-sensor",
            zone_id: "z1",
            gas_type: "CH4",
            sim_time: 30,
            duration_minutes: 10,
            sample_interval_minutes: 5,
            curve: "linear_ramp",
            params: {},
          },
        ],
        permit_events: [
          {
            name: "earlier-permit",
            zone_id: "z1",
            sim_time: 5,
            permit_type: "hot_work",
            authorizing_officer_id: "w1",
            duration_minutes: 60,
          },
        ],
      }),
    );
    expect(sequence.map((s) => s.name)).toEqual(["earlier-permit", "later-sensor"]);
    expect(sequence[0].kind).toBe("permit");
    expect(sequence[1].kind).toBe("sensor");
  });
});
