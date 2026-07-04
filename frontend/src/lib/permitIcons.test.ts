import { describe, expect, it } from "vitest";

import type { Permit } from "../api/types";
import { activePermitTypesForZone, formatPermitType, permitTypeGlyph } from "./permitIcons";

function permit(overrides: Partial<Permit>): Permit {
  return {
    permit_id: "p1",
    permit_type: "hot_work",
    zone_id: "zone-a",
    issued_at: "2026-01-01T00:00:00Z",
    expires_at: "2026-01-01T02:00:00Z",
    authorizing_officer_id: "worker-1",
    status: "active",
    baseline_snapshot: {},
    ...overrides,
  };
}

describe("permitTypeGlyph", () => {
  // Real, persisted permit_type values are snake_case - confirmed
  // live against GET /scenario-builder/options, never the title-cased
  // display strings a first pass at this file wrongly assumed.
  it("maps hot_work to the flame glyph", () => {
    expect(permitTypeGlyph("hot_work")).toBe("hot_work");
  });

  it("maps confined_space to the confined-space glyph", () => {
    expect(permitTypeGlyph("confined_space")).toBe("confined_space");
  });

  it("maps electrical_isolation to the isolation glyph", () => {
    expect(permitTypeGlyph("electrical_isolation")).toBe("isolation");
  });

  it("maps line_break to the line-break glyph", () => {
    expect(permitTypeGlyph("line_break")).toBe("line_break");
  });

  it("is case-insensitive", () => {
    expect(permitTypeGlyph("HOT_WORK")).toBe("hot_work");
  });

  it("falls back to generic for an unrecognized permit type", () => {
    expect(permitTypeGlyph("excavation")).toBe("generic");
  });

  it("falls back to generic for the old (wrong) title-cased assumption - real data never sends this", () => {
    expect(permitTypeGlyph("Hot Work")).toBe("generic");
  });
});

describe("formatPermitType", () => {
  it("formats each of the four real permit types for display", () => {
    expect(formatPermitType("hot_work")).toBe("Hot Work");
    expect(formatPermitType("confined_space")).toBe("Confined Space");
    expect(formatPermitType("electrical_isolation")).toBe("Isolation (Electrical)");
    expect(formatPermitType("line_break")).toBe("Line Break");
  });

  it("falls back to the raw value for an unrecognized permit type", () => {
    expect(formatPermitType("excavation")).toBe("excavation");
  });
});

describe("activePermitTypesForZone", () => {
  it("returns the permit types belonging to the given zone only", () => {
    const permits = [
      permit({ zone_id: "zone-a", permit_type: "hot_work" }),
      permit({ zone_id: "zone-b", permit_type: "confined_space" }),
      permit({ zone_id: "zone-a", permit_type: "electrical_isolation" }),
    ];
    expect(activePermitTypesForZone(permits, "zone-a")).toEqual(["hot_work", "electrical_isolation"]);
  });

  it("returns an empty array when the zone has no permits", () => {
    expect(activePermitTypesForZone([], "zone-a")).toEqual([]);
  });
});
