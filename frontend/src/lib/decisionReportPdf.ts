import { jsPDF } from "jspdf";

/**
 * M27 Part 2 (Decision Report Generator) - a generic, professional PDF
 * layout engine. It knows nothing about risk assessments, agents, or
 * any domain concept - it only lays out sections of already-composed
 * text lines the caller assembled from real, already-computed data
 * (see `pages/DecisionReportPage.tsx`). Keeping this file domain-free
 * makes it trivially testable (pure layout, no data fetching) and
 * keeps every fact this PDF contains traceable to whoever built the
 * `DecisionReportSection[]` it receives.
 */

export interface DecisionReportSection {
  heading: string;
  /** Empty lines are rendered as vertical spacing. */
  lines: string[];
}

export interface DecisionReportData {
  title: string;
  subtitle: string;
  generatedAt: string;
  sections: DecisionReportSection[];
}

const PAGE_MARGIN = 14;
const LINE_HEIGHT = 5.2;
const HEADING_GAP_BEFORE = 8;
const HEADING_GAP_AFTER = 3;

/** Builds the PDF document in memory - exported separately from
 * `exportDecisionReportPdf` so tests can inspect the document without
 * triggering a browser file download. */
export function buildDecisionReportPdf(data: DecisionReportData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  let y = PAGE_MARGIN;

  function ensureSpace(nextLineHeight: number): void {
    if (y + nextLineHeight > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.title, PAGE_MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.subtitle, PAGE_MARGIN, y);
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${data.generatedAt}`, PAGE_MARGIN, y);
  doc.setTextColor(0);
  y += 10;

  for (const section of data.sections) {
    ensureSpace(HEADING_GAP_BEFORE + LINE_HEIGHT + HEADING_GAP_AFTER);
    y += HEADING_GAP_BEFORE;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(section.heading, PAGE_MARGIN, y);
    y += HEADING_GAP_AFTER + 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const line of section.lines) {
      if (line === "") {
        y += LINE_HEIGHT / 2;
        continue;
      }
      const wrapped = doc.splitTextToSize(line, contentWidth) as string[];
      for (const wrappedLine of wrapped) {
        ensureSpace(LINE_HEIGHT);
        doc.text(wrappedLine, PAGE_MARGIN, y);
        y += LINE_HEIGHT;
      }
    }
  }

  return doc;
}

/** Builds the document and triggers a browser download. */
export function exportDecisionReportPdf(data: DecisionReportData, filename: string): void {
  const doc = buildDecisionReportPdf(data);
  doc.save(filename);
}
