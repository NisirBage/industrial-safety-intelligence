import type { DecisionReportSection } from "./decisionReportPdf";

/**
 * M28 Part 8 (Report Templates) - the milestone's own instruction is
 * "each contains different information for different audiences", not
 * "compute new information per audience". `DecisionReportPage` (M27
 * Part 2) already assembles every fact this platform can report on a
 * single decision into one flat list of headed sections
 * (`DecisionReportSection[]`) - this file adds no new computation at
 * all, only a per-audience *selection* of which of those
 * already-built sections belong in which document, by heading.
 */
export type ReportTemplateKind = "executive" | "operator" | "audit" | "incident" | "maintenance";

export interface ReportTemplate {
  kind: ReportTemplateKind;
  label: string;
  description: string;
  /** Exact `DecisionReportSection.heading` strings this template
   * includes, in the order they should appear. Any heading not
   * listed here is simply omitted from this audience's document. */
  sectionHeadings: string[];
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    kind: "executive",
    label: "Executive Report",
    description: "Business impact and outcome, without agent-level math - for leadership review.",
    sectionHeadings: [
      "Executive Summary",
      "Decision Stability",
      "Recommended Actions & Business Impact",
      "Historical Matches",
      "Operational Foresight",
      "Compliance References",
    ],
  },
  {
    kind: "operator",
    label: "Operator Report",
    description: "Rationale, agent detail, and current plant state - for the person running the shift.",
    sectionHeadings: [
      "Executive Summary",
      "Decision Rationale",
      "Agent Contributions",
      "Digital Twin Snapshot",
      "Recommended Actions & Business Impact",
      "Timeline (preceding ticks)",
    ],
  },
  {
    kind: "audit",
    label: "Audit Report",
    description: "Full rationale, confidence, compliance alignment, and audit trail - for compliance review.",
    sectionHeadings: [
      "Executive Summary",
      "Decision Rationale",
      "Agent Contributions",
      "Confidence Breakdown",
      "Compliance References",
      "Counterfactual Comparison",
      "Audit Trail",
    ],
  },
  {
    kind: "incident",
    label: "Incident Report",
    description: "What happened, over what timeline, and how it compares to precedent - for post-incident review.",
    sectionHeadings: [
      "Executive Summary",
      "Decision Rationale",
      "Timeline (preceding ticks)",
      "Historical Matches",
      "Counterfactual Comparison",
      "Recommended Actions & Business Impact",
      "Audit Trail",
    ],
  },
  {
    kind: "maintenance",
    label: "Maintenance Report",
    description: "Equipment state and related risk - for the maintenance team, without business or compliance detail.",
    sectionHeadings: [
      "Executive Summary",
      "Digital Twin Snapshot",
      "Agent Contributions",
      "Recommended Actions & Business Impact",
      "Timeline (preceding ticks)",
    ],
  },
];

export function getReportTemplate(kind: ReportTemplateKind): ReportTemplate {
  return REPORT_TEMPLATES.find((t) => t.kind === kind) ?? REPORT_TEMPLATES[0];
}

/** Filters an already-built full section list down to one audience's
 * subset, preserving that template's own section order rather than
 * the source list's order. */
export function selectReportSections(
  kind: ReportTemplateKind,
  allSections: DecisionReportSection[],
): DecisionReportSection[] {
  const template = getReportTemplate(kind);
  const byHeading = new Map(allSections.map((section) => [section.heading, section]));
  return template.sectionHeadings
    .map((heading) => byHeading.get(heading))
    .filter((section): section is DecisionReportSection => section !== undefined);
}
