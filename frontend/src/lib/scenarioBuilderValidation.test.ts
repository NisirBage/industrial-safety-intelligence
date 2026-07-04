import { describe, expect, it } from "vitest";

import type { ScenarioDefinitionDraft } from "../api/types";
import { validateScenarioDraft, type ScenarioValidationContext } from "./scenarioBuilderValidation";

const ZONE_A = "zone-a";
const WORKER_ASSIGNED = "worker-assigned";
const WORKER_UNASSIGNED = "worker-unassigned";

function baseContext(): ScenarioValidationContext {
  return {
    knownZoneIds: new Set([ZONE_A]),
    knownWorkerIds: new Set([WORKER_ASSIGNED, WORKER_UNASSIGNED]),
    unassignedWorkerIds: new Set([WORKER_UNASSIGNED]),
    zoneGasTypes: new Map([[ZONE_A, new Set(["CH4"])]]),
  };
}

function baseDraft(): ScenarioDefinitionDraft {
  return {
    title: "t",
    description: "",
    seed: 1,
    start_time: "2026-01-01T00:00:00Z",
    sensor_events: [
      {
        name: "s1",
        zone_id: ZONE_A,
        gas_type: "CH4",
        sim_time: 0,
        duration_minutes: 10,
        sample_interval_minutes: 5,
        curve: "linear_ramp",
        params: { start_value: 2, slope: 0.5 },
      },
    ],
    permit_events: [
      {
        name: "p1",
        zone_id: ZONE_A,
        sim_time: 0,
        permit_type: "hot_work",
        authorizing_officer_id: WORKER_ASSIGNED,
        duration_minutes: 60,
      },
    ],
  };
}

describe("validateScenarioDraft", () => {
  it("returns no errors for a fully valid draft", () => {
    expect(validateScenarioDraft(baseDraft(), baseContext())).toEqual([]);
  });

  it("flags duplicate event names across sensor and permit events", () => {
    const draft = baseDraft();
    draft.permit_events[0].name = draft.sensor_events[0].name;
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("duplicate event name"))).toBe(true);
  });

  it("flags negative sim_time", () => {
    const draft = baseDraft();
    draft.sensor_events[0].sim_time = -1;
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("sim_time must be >= 0"))).toBe(true);
  });

  it("flags non-positive duration_minutes", () => {
    const draft = baseDraft();
    draft.permit_events[0].duration_minutes = 0;
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("duration_minutes must be > 0"))).toBe(true);
  });

  it("flags an unknown curve type", () => {
    const draft = baseDraft();
    draft.sensor_events[0].curve = "bogus_curve";
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("unknown curve type"))).toBe(true);
  });

  it("flags missing required curve params", () => {
    const draft = baseDraft();
    draft.sensor_events[0].params = { start_value: 2 }; // linear_ramp also needs slope
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("missing params"))).toBe(true);
  });

  it("flags a curve that produces a negative concentration", () => {
    const draft = baseDraft();
    draft.sensor_events[0].params = { start_value: 2, slope: -1 };
    draft.sensor_events[0].duration_minutes = 10;
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("negative concentration"))).toBe(true);
  });

  it("flags an unknown zone on a sensor event", () => {
    const draft = baseDraft();
    draft.sensor_events[0].zone_id = "zone-does-not-exist";
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes('unknown zone "zone-does-not-exist"'))).toBe(true);
  });

  it("flags a gas type with no matching sensor on the zone", () => {
    const draft = baseDraft();
    draft.sensor_events[0].gas_type = "H2S";
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("no sensor for zone"))).toBe(true);
  });

  it("flags an unknown authorizing officer", () => {
    const draft = baseDraft();
    draft.permit_events[0].authorizing_officer_id = "worker-does-not-exist";
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("unknown authorizing officer"))).toBe(true);
  });

  it("flags an authorizing officer with no current zone", () => {
    const draft = baseDraft();
    draft.permit_events[0].authorizing_officer_id = WORKER_UNASSIGNED;
    const errors = validateScenarioDraft(draft, baseContext());
    expect(errors.some((e) => e.includes("is not currently assigned to any zone"))).toBe(true);
  });
});
