import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../api/types";
import { deriveTimelineEvents } from "./operatorTimeline";

function assessment(overrides: Partial<RiskAssessment>): RiskAssessment {
  return {
    assessment_id: "a1",
    zone_id: "zone-a",
    timestamp: "2026-01-01T00:00:00Z",
    compound_risk_score: 10,
    confidence: 1,
    tier: "normal",
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: {},
      interaction_bonus_applied: 1.0,
      tier_before: "normal",
      tier_after: "normal",
    },
    ...overrides,
  };
}

describe("deriveTimelineEvents", () => {
  it("emits no tier_change on the first tick (nothing to compare against)", () => {
    const events = deriveTimelineEvents([assessment({ tier: "critical", compound_risk_score: 90 })]);
    expect(events.some((e) => e.kind === "tier_change")).toBe(false);
  });

  it("emits tier_change and critical when tier escalates into CRITICAL", () => {
    const events = deriveTimelineEvents([
      assessment({ timestamp: "2026-01-01T00:00:00Z", tier: "watch", compound_risk_score: 20 }),
      assessment({ timestamp: "2026-01-01T00:05:00Z", tier: "critical", compound_risk_score: 90 }),
    ]);
    expect(events.map((e) => e.kind)).toContain("tier_change");
    expect(events.map((e) => e.kind)).toContain("critical");
  });

  it("emits interaction_bonus only on the onset tick, not every sustained tick", () => {
    const bonusJustification = {
      schema_version: 1,
      rules_fired: ["interaction_bonus_applied"],
      agent_contributions: {},
      interaction_bonus_applied: 1.8,
      tier_before: "elevated",
      tier_after: "critical",
    };
    const events = deriveTimelineEvents([
      assessment({ timestamp: "2026-01-01T00:00:00Z", justification: bonusJustification }),
      assessment({ timestamp: "2026-01-01T00:05:00Z", justification: bonusJustification }),
    ]);
    expect(events.filter((e) => e.kind === "interaction_bonus")).toHaveLength(1);
  });

  it("emits exactly one highest_risk event at the global peak", () => {
    const events = deriveTimelineEvents([
      assessment({ timestamp: "2026-01-01T00:00:00Z", compound_risk_score: 10 }),
      assessment({ timestamp: "2026-01-01T00:05:00Z", compound_risk_score: 90 }),
      assessment({ timestamp: "2026-01-01T00:10:00Z", compound_risk_score: 50 }),
    ]);
    const peaks = events.filter((e) => e.kind === "highest_risk");
    expect(peaks).toHaveLength(1);
    expect(peaks[0].timestamp).toBe("2026-01-01T00:05:00Z");
  });

  it("returns events sorted chronologically", () => {
    const events = deriveTimelineEvents([
      assessment({ timestamp: "2026-01-01T00:00:00Z", tier: "normal", compound_risk_score: 5 }),
      assessment({ timestamp: "2026-01-01T00:05:00Z", tier: "watch", compound_risk_score: 20 }),
      assessment({ timestamp: "2026-01-01T00:10:00Z", tier: "critical", compound_risk_score: 95 }),
    ]);
    const timestamps = events.map((e) => new Date(e.timestamp).getTime());
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });
});
