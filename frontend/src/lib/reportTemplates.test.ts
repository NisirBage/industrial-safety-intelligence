import { describe, expect, it } from "vitest";

import type { DecisionReportSection } from "./decisionReportPdf";
import { getReportTemplate, REPORT_TEMPLATES, selectReportSections } from "./reportTemplates";

const ALL_SECTIONS: DecisionReportSection[] = [
  { heading: "Executive Summary", lines: ["a"] },
  { heading: "Decision Rationale", lines: ["b"] },
  { heading: "Agent Contributions", lines: ["c"] },
  { heading: "Confidence Breakdown", lines: ["d"] },
  { heading: "Decision Stability", lines: ["e"] },
  { heading: "Recommended Actions & Business Impact", lines: ["f"] },
  { heading: "Compliance References", lines: ["g"] },
  { heading: "Timeline (preceding ticks)", lines: ["h"] },
  { heading: "Digital Twin Snapshot", lines: ["i"] },
  { heading: "Historical Matches", lines: ["j"] },
  { heading: "Operational Foresight", lines: ["k"] },
  { heading: "Knowledge Graph Summary", lines: ["l"] },
  { heading: "Counterfactual Comparison", lines: ["m"] },
  { heading: "Audit Trail", lines: ["n"] },
];

describe("REPORT_TEMPLATES", () => {
  it("defines exactly the five audiences the milestone specifies", () => {
    expect(REPORT_TEMPLATES.map((t) => t.kind)).toEqual([
      "executive",
      "operator",
      "audit",
      "incident",
      "maintenance",
    ]);
  });

  it("every listed heading corresponds to a real DecisionReportPage section", () => {
    const realHeadings = new Set(ALL_SECTIONS.map((s) => s.heading));
    for (const template of REPORT_TEMPLATES) {
      for (const heading of template.sectionHeadings) {
        expect(realHeadings.has(heading)).toBe(true);
      }
    }
  });
});

describe("getReportTemplate", () => {
  it("finds a template by kind", () => {
    expect(getReportTemplate("audit").label).toBe("Audit Report");
  });
});

describe("selectReportSections", () => {
  it("selects only the executive template's own sections, in its own order", () => {
    const result = selectReportSections("executive", ALL_SECTIONS);
    expect(result.map((s) => s.heading)).toEqual([
      "Executive Summary",
      "Decision Stability",
      "Recommended Actions & Business Impact",
      "Historical Matches",
      "Operational Foresight",
      "Compliance References",
    ]);
  });

  it("selects a different subset for the maintenance template", () => {
    const result = selectReportSections("maintenance", ALL_SECTIONS);
    expect(result.map((s) => s.heading)).toEqual([
      "Executive Summary",
      "Digital Twin Snapshot",
      "Agent Contributions",
      "Recommended Actions & Business Impact",
      "Timeline (preceding ticks)",
    ]);
  });

  it("omits a requested heading that isn't present in the source sections", () => {
    const partial = ALL_SECTIONS.filter((s) => s.heading !== "Audit Trail");
    const result = selectReportSections("audit", partial);
    expect(result.some((s) => s.heading === "Audit Trail")).toBe(false);
  });
});
