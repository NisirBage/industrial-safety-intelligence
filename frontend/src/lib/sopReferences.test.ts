import { describe, expect, it } from "vitest";

import { getSopReference, SOP_BY_PERMIT_TYPE, SOP_BY_RECOMMENDATION_ID } from "./sopReferences";

describe("getSopReference", () => {
  it("prefers a permit-type-specific SOP when an active permit type is supplied", () => {
    const sop = getSopReference("permit_status_escalated", ["hot_work"]);
    expect(sop?.standard).toBe("OISD-STD-105");
    expect(sop?.section).toBe("Section 7.2");
    expect(sop?.title).toBe("Hot Work Authorization Procedure");
  });

  it("falls back to the recommendation-id table when no permit type matches", () => {
    const sop = getSopReference("tier_critical", []);
    expect(sop?.standard).toBe("Emergency Response Plan");
    expect(sop?.section).toBe("Section 3.1");
  });

  it("returns null rather than fabricating a reference for an unconfigured id", () => {
    expect(getSopReference("some_future_rule", [])).toBeNull();
  });

  it("checks each active permit type in order and uses the first configured match", () => {
    const sop = getSopReference("tier_critical", ["excavation", "confined_space"]);
    expect(sop?.standard).toBe("OISD-STD-192");
    expect(sop?.section).toBe("Section 4.1");
  });

  it("every configured entry has a summary and no fabricated external URL", () => {
    const allEntries = [...Object.values(SOP_BY_PERMIT_TYPE), ...Object.values(SOP_BY_RECOMMENDATION_ID)];
    for (const sop of allEntries) {
      expect(sop.summary.length).toBeGreaterThan(0);
      expect(sop.externalUrl).toBeNull();
    }
  });
});
