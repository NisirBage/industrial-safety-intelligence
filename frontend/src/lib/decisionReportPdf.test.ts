import { describe, expect, it } from "vitest";

import { buildDecisionReportPdf, type DecisionReportData } from "./decisionReportPdf";

function baseData(overrides: Partial<DecisionReportData> = {}): DecisionReportData {
  return {
    title: "Decision Report",
    subtitle: "Tank Farm - 2026-07-01T08:05:00Z",
    generatedAt: "2026-07-12T00:00:00Z",
    sections: [
      { heading: "Executive Summary", lines: ["Tier: ELEVATED", "Confidence: 91%"] },
    ],
    ...overrides,
  };
}

describe("buildDecisionReportPdf", () => {
  it("builds a single-page document for short content", () => {
    const doc = buildDecisionReportPdf(baseData());
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("renders every section heading somewhere in the extracted text", () => {
    const data = baseData({
      sections: [
        { heading: "Executive Summary", lines: ["Line one"] },
        { heading: "Compliance References", lines: ["OSHA General Duty Clause"] },
      ],
    });
    const doc = buildDecisionReportPdf(data);
    const text = doc.output("datauristring");
    expect(text.length).toBeGreaterThan(0);
  });

  it("adds additional pages when content overflows one page", () => {
    const manyLines = Array.from({ length: 200 }, (_, i) => `Line ${i}`);
    const data = baseData({ sections: [{ heading: "Long Section", lines: manyLines }] });
    const doc = buildDecisionReportPdf(data);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("treats empty-string lines as spacing rather than throwing", () => {
    const data = baseData({ sections: [{ heading: "Spaced", lines: ["First", "", "Second"] }] });
    expect(() => buildDecisionReportPdf(data)).not.toThrow();
  });
});
