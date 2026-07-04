import { describe, expect, it } from "vitest";

import { findNearestTimestampIndex, mergeTimestamps } from "./replayTimeline";

describe("mergeTimestamps", () => {
  it("deduplicates and sorts timestamps across zones", () => {
    const result = mergeTimestamps([
      ["2026-01-01T00:10:00Z", "2026-01-01T00:00:00Z"],
      ["2026-01-01T00:00:00Z", "2026-01-01T00:05:00Z"],
    ]);
    expect(result).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:05:00Z",
      "2026-01-01T00:10:00Z",
    ]);
  });

  it("returns an empty list for no zones", () => {
    expect(mergeTimestamps([])).toEqual([]);
  });
});

describe("findNearestTimestampIndex", () => {
  const timestamps = ["2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z", "2026-01-01T00:20:00Z"];

  it("returns the exact match when one exists", () => {
    expect(findNearestTimestampIndex(timestamps, "2026-01-01T00:10:00Z")).toBe(1);
  });

  it("returns the closest index when there is no exact match", () => {
    expect(findNearestTimestampIndex(timestamps, "2026-01-01T00:08:00Z")).toBe(1);
    expect(findNearestTimestampIndex(timestamps, "2026-01-01T00:03:00Z")).toBe(0);
  });

  it("clamps to the last index when the target is after every timestamp", () => {
    expect(findNearestTimestampIndex(timestamps, "2026-01-01T01:00:00Z")).toBe(2);
  });

  it("clamps to the first index when the target is before every timestamp", () => {
    expect(findNearestTimestampIndex(timestamps, "2025-01-01T00:00:00Z")).toBe(0);
  });

  it("returns 0 for an empty timestamp list", () => {
    expect(findNearestTimestampIndex([], "2026-01-01T00:00:00Z")).toBe(0);
  });
});
