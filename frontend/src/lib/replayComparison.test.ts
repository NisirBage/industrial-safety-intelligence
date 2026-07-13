import { describe, expect, it } from "vitest";

import { timeAtFraction } from "./replayComparison";

describe("timeAtFraction", () => {
  it("returns the start time at fraction 0", () => {
    expect(timeAtFraction("2026-07-01T08:00:00Z", "2026-07-01T09:00:00Z", 0)).toBe(
      new Date("2026-07-01T08:00:00Z").getTime(),
    );
  });

  it("returns the end time at fraction 1", () => {
    expect(timeAtFraction("2026-07-01T08:00:00Z", "2026-07-01T09:00:00Z", 1)).toBe(
      new Date("2026-07-01T09:00:00Z").getTime(),
    );
  });

  it("returns the midpoint at fraction 0.5", () => {
    expect(timeAtFraction("2026-07-01T08:00:00Z", "2026-07-01T09:00:00Z", 0.5)).toBe(
      new Date("2026-07-01T08:30:00Z").getTime(),
    );
  });

  it("clamps fractions outside [0, 1]", () => {
    expect(timeAtFraction("2026-07-01T08:00:00Z", "2026-07-01T09:00:00Z", -1)).toBe(
      new Date("2026-07-01T08:00:00Z").getTime(),
    );
    expect(timeAtFraction("2026-07-01T08:00:00Z", "2026-07-01T09:00:00Z", 2)).toBe(
      new Date("2026-07-01T09:00:00Z").getTime(),
    );
  });
});
