import { describe, expect, it } from "vitest";

import type { RiskAssessment } from "../api/types";
import { assessmentAtOrBefore } from "./timeline";

function assessment(timestamp: string, score: number): RiskAssessment {
  return {
    assessment_id: timestamp,
    zone_id: "z1",
    timestamp,
    compound_risk_score: score,
    confidence: 1,
    tier: "normal",
    justification: {},
  };
}

describe("assessmentAtOrBefore", () => {
  const history = [
    assessment("2026-01-01T00:00:00Z", 10),
    assessment("2026-01-01T00:05:00Z", 20),
    assessment("2026-01-01T00:10:00Z", 30),
  ];

  it("returns the most recent item at or before the given time", () => {
    const result = assessmentAtOrBefore(history, new Date("2026-01-01T00:07:00Z").getTime());
    expect(result?.compound_risk_score).toBe(20);
  });

  it("returns the exact match when the time equals a real timestamp", () => {
    const result = assessmentAtOrBefore(history, new Date("2026-01-01T00:05:00Z").getTime());
    expect(result?.compound_risk_score).toBe(20);
  });

  it("returns null when every item is after the given time", () => {
    const result = assessmentAtOrBefore(history, new Date("2025-12-31T00:00:00Z").getTime());
    expect(result).toBeNull();
  });

  it("never interpolates - returns the last known value, not an average", () => {
    const result = assessmentAtOrBefore(history, new Date("2026-01-01T00:09:59Z").getTime());
    expect(result?.compound_risk_score).toBe(20);
  });
});
