import { describe, expect, it } from "vitest";

import { STANDARDS_FOR_RECOMMENDATION, standardsForRecommendation } from "./complianceStandards";

describe("complianceStandards", () => {
  it("returns supporting standards for a known recommendation id", () => {
    const standards = standardsForRecommendation("tier_critical");
    expect(standards.length).toBeGreaterThan(0);
    for (const standard of standards) {
      expect(standard.code).not.toBe("");
      expect(standard.title).not.toBe("");
      expect(standard.summary).not.toBe("");
      expect(standard.applicability).not.toBe("");
      expect(standard.externalReference).not.toBe("");
    }
  });

  it("returns an empty array for an unrecognized id, not an error", () => {
    expect(standardsForRecommendation("not_a_real_id")).toEqual([]);
  });

  it("honestly labels Company SOP entries as internal", () => {
    for (const standards of Object.values(STANDARDS_FOR_RECOMMENDATION)) {
      for (const standard of standards) {
        if (standard.code === "Company SOP") {
          expect(standard.applicability.toLowerCase()).toContain("internal");
          expect(standard.externalReference.toLowerCase()).toContain("not modeled");
        }
      }
    }
  });
});
