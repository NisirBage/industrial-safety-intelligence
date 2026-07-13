import { describe, expect, it } from "vitest";

import type { RiskAssessment, Tier } from "../api/types";
import type { ConfidenceFactor } from "./confidenceBreakdown";
import {
  buildRecommendationStability,
  countUnchangedRecommendationTicks,
  detectOscillation,
} from "./decisionStability";

function assessment(tier: Tier, timestamp: string): RiskAssessment {
  return {
    assessment_id: `a-${timestamp}`,
    zone_id: "z1",
    timestamp,
    compound_risk_score: 50,
    confidence: 0.8,
    tier,
    justification: {
      schema_version: 1,
      rules_fired: [],
      agent_contributions: {},
      interaction_bonus_applied: 1,
      tier_before: tier,
      tier_after: tier,
    },
  };
}

describe("countUnchangedRecommendationTicks", () => {
  it("counts consecutive newest-first ticks sharing the same top recommendation", () => {
    const timelineNewestFirst = [
      assessment("critical", "2026-07-01T08:03:00+00:00"),
      assessment("critical", "2026-07-01T08:02:00+00:00"),
      assessment("critical", "2026-07-01T08:01:00+00:00"),
      assessment("watch", "2026-07-01T08:00:00+00:00"),
    ];

    expect(countUnchangedRecommendationTicks(timelineNewestFirst)).toBe(3);
  });

  it("returns 0 for an empty timeline", () => {
    expect(countUnchangedRecommendationTicks([])).toBe(0);
  });
});

describe("detectOscillation", () => {
  it("detects no oscillation for a single monotonic climb", () => {
    const timelineNewestFirst = [
      assessment("critical", "2026-07-01T08:03:00+00:00"),
      assessment("elevated", "2026-07-01T08:02:00+00:00"),
      assessment("watch", "2026-07-01T08:01:00+00:00"),
      assessment("normal", "2026-07-01T08:00:00+00:00"),
    ];

    const result = detectOscillation(timelineNewestFirst);
    expect(result.detected).toBe(false);
    expect(result.reversals).toBe(0);
  });

  it("detects oscillation when the tier flaps back and forth repeatedly", () => {
    const timelineNewestFirst = [
      assessment("elevated", "2026-07-01T08:04:00+00:00"),
      assessment("watch", "2026-07-01T08:03:00+00:00"),
      assessment("elevated", "2026-07-01T08:02:00+00:00"),
      assessment("watch", "2026-07-01T08:01:00+00:00"),
      assessment("normal", "2026-07-01T08:00:00+00:00"),
    ];

    const result = detectOscillation(timelineNewestFirst);
    expect(result.detected).toBe(true);
    expect(result.reversals).toBeGreaterThanOrEqual(2);
  });
});

describe("buildRecommendationStability", () => {
  it("assembles a stability summary from real timeline + confidence factors", () => {
    const timelineNewestFirst = [
      assessment("critical", "2026-07-01T08:02:00+00:00"),
      assessment("critical", "2026-07-01T08:01:00+00:00"),
      assessment("critical", "2026-07-01T08:00:00+00:00"),
    ];
    const confidenceFactors: ConfidenceFactor[] = [
      { label: "Historical Agreement", kind: "percentage", value: 0.91, source: "test" },
      { label: "Forecast Agreement", kind: "percentage", value: 0.89, source: "test" },
    ];

    const stability = buildRecommendationStability(timelineNewestFirst, confidenceFactors);

    expect(stability.unchangedForTicks).toBe(3);
    expect(stability.oscillationDetected).toBe(false);
    expect(stability.historicalAgreement?.kind).toBe("percentage");
    expect(stability.reason).toMatch(/91%/);
    expect(stability.reason).toMatch(/89%/);
  });

  it("reports no stability history for a single-tick timeline", () => {
    const stability = buildRecommendationStability(
      [assessment("watch", "2026-07-01T08:00:00+00:00")],
      [],
    );

    expect(stability.unchangedForTicks).toBe(1);
    expect(stability.reason).toMatch(/no stability history yet/);
  });
});
