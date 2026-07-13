import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { QueryResult } from "../components/common/QueryResult";
import { ConfidenceBreakdown } from "../components/explainability/ConfidenceBreakdown";
import { DecisionStabilityPanel } from "../components/explainability/DecisionStabilityPanel";
import { RecommendationList } from "../components/explainability/RecommendationList";
import { useAuditLog } from "../hooks/useAuditLog";
import { useForesightForecast } from "../hooks/useForesightForecast";
import { useGraphSubgraph } from "../hooks/useGraphSubgraph";
import { useHistoricalMatches } from "../hooks/useHistoricalMatches";
import { usePermits } from "../hooks/usePermits";
import { useRiskAssessment } from "../hooks/useRiskAssessment";
import { useRiskHistory } from "../hooks/useRiskHistory";
import { useScenarios } from "../hooks/useScenarios";
import { useZoneEquipment } from "../hooks/useScenarioBuilder";
import { useZoneCounterfactuals } from "../hooks/useZoneCounterfactuals";
import { useZoneWorkerCounts } from "../hooks/useZoneWorkerCounts";
import { useZones } from "../hooks/useZones";
import { buildActionQueue } from "../lib/actionPlaybook";
import { buildAgentContributionReason } from "../lib/agentContributionReasons";
import { standardsForRecommendation } from "../lib/complianceStandards";
import { buildConfidenceBreakdown } from "../lib/confidenceBreakdown";
import { buildRecommendationStability } from "../lib/decisionStability";
import type { DecisionReportSection } from "../lib/decisionReportPdf";
import { exportDecisionReportPdf } from "../lib/decisionReportPdf";
import { generateExecutiveExplanation } from "../lib/executiveExplanation";
import { formatTimestamp, zoneLabel } from "../lib/format";
import { agentDisplayName, parseJustification } from "../lib/justification";
import { deriveRecommendations } from "../lib/recommendations";
import type { ReportTemplateKind } from "../lib/reportTemplates";
import { getReportTemplate, REPORT_TEMPLATES, selectReportSections } from "../lib/reportTemplates";
import { resolveScenarioKey } from "../lib/scenarioResolution";

/**
 * M27 Part 2 (Decision Report Generator) - a single company-ready
 * document assembling every already-computed fact about one
 * persisted decision: nothing here is recomputed, every section
 * reads from an existing hook the rest of this app already uses.
 * "Export to PDF" hands the same assembled sections to
 * `decisionReportPdf.ts`'s generic (domain-free) layout engine.
 */
export function DecisionReportPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [templateKind, setTemplateKind] = useState<ReportTemplateKind>("executive");
  const { data: assessment, isLoading, error, refetch } = useRiskAssessment(assessmentId);
  const { data: zones } = useZones();
  const { data: scenarios } = useScenarios();

  const justification = assessment ? parseJustification(assessment.justification) : null;
  const recommendations = assessment
    ? deriveRecommendations(assessment.tier, justification)
    : [];
  const actionQueue = buildActionQueue(recommendations, justification);

  const { data: historicalMatches } = useHistoricalMatches(assessment?.zone_id, assessment?.timestamp);
  const bestMatch = historicalMatches?.matches[0];
  const scenarioKey = resolveScenarioKey(scenarios, assessment?.zone_id, assessment?.timestamp);
  const { data: foresight } = useForesightForecast(
    assessment?.zone_id,
    assessment?.timestamp,
    scenarioKey,
  );
  const confidenceFactors = assessment
    ? buildConfidenceBreakdown(assessment, justification, bestMatch, foresight)
    : [];

  const counterfactualQueries = useZoneCounterfactuals(
    assessment ? [{ zoneId: assessment.zone_id, timestamp: assessment.timestamp }] : [],
  );
  const counterfactual = counterfactualQueries[0]?.data;

  const { data: subgraph } = useGraphSubgraph(
    assessment ? "risk_assessment" : undefined,
    assessment?.assessment_id,
    { depth: 1 },
  );

  const workerCountQueries = useZoneWorkerCounts(assessment ? [assessment.zone_id] : []);
  const workerCount = workerCountQueries[0]?.data;
  const { data: equipment } = useZoneEquipment(assessment?.zone_id);
  const { data: activePermits } = usePermits(
    assessment ? { zone_id: assessment.zone_id, status: "active" } : {},
  );
  const { data: riskHistory } = useRiskHistory(
    assessment?.zone_id,
    assessment ? { limit: 10, before: assessment.timestamp } : {},
  );
  const { data: stabilityTimeline } = useRiskHistory(assessment?.zone_id, { limit: 50 });
  const stability = buildRecommendationStability(stabilityTimeline?.items ?? [], confidenceFactors);
  const { data: auditEntries } = useAuditLog(
    assessment ? { zone_id: assessment.zone_id, limit: 10, before: assessment.timestamp } : {},
  );

  const executiveExplanation = assessment
    ? generateExecutiveExplanation(assessment, justification, recommendations)
    : "";

  function handleExportPdf(): void {
    if (!assessment) {
      return;
    }
    const template = getReportTemplate(templateKind);
    exportDecisionReportPdf(
      {
        title: template.label,
        subtitle: `${zoneLabel(assessment.zone_id, zones)} - ${formatTimestamp(assessment.timestamp)}`,
        generatedAt: new Date().toISOString(),
        sections: selectReportSections(templateKind, buildSections()),
      },
      `${template.kind}-report-${assessment.assessment_id}.pdf`,
    );
  }

  function buildSections(): DecisionReportSection[] {
    if (!assessment) {
      return [];
    }
    const sections: DecisionReportSection[] = [];

    sections.push({
      heading: "Executive Summary",
      lines: [
        `Zone: ${zoneLabel(assessment.zone_id, zones)}`,
        `Timestamp: ${formatTimestamp(assessment.timestamp)}`,
        `Tier: ${assessment.tier.toUpperCase()}`,
        `Compound risk score: ${assessment.compound_risk_score.toFixed(1)}`,
        `Confidence: ${(assessment.confidence * 100).toFixed(0)}%`,
        "",
        executiveExplanation,
      ],
    });

    sections.push({
      heading: "Decision Rationale",
      lines: justification
        ? [
            `Tier transition: ${justification.tierBefore.toUpperCase()} -> ${justification.tierAfter.toUpperCase()}`,
            `Interaction bonus applied: ${justification.interactionBonusApplied.toFixed(2)}`,
            `Rules fired: ${justification.rulesFired.join(", ") || "none"}`,
          ]
        : ["No structured justification available for this tick."],
    });

    sections.push({
      heading: "Agent Contributions",
      lines: justification
        ? Object.entries(justification.agentContributions).flatMap(([agent, c]) => [
            `${agentDisplayName(agent)}: risk ${c.risk.toFixed(1)}, confidence ${(c.confidence * 100).toFixed(0)}%`,
            `  Reason: ${buildAgentContributionReason(agent, c, justification)}`,
          ])
        : ["Unavailable."],
    });

    sections.push({
      heading: "Confidence Breakdown",
      lines: confidenceFactors.map((factor) => {
        if (factor.kind === "percentage") {
          return `${factor.label}: ${(factor.value * 100).toFixed(0)}% (${factor.source})`;
        }
        if (factor.kind === "categorical") {
          return `${factor.label}: ${factor.categoryLabel} (${factor.source})`;
        }
        return `${factor.label}: Unavailable - ${factor.reason}`;
      }),
    });

    sections.push({
      heading: "Decision Stability",
      lines: [
        `Recommendation unchanged for ${stability.unchangedForTicks} tick(s)`,
        `Oscillation: ${stability.oscillationDetected ? `detected (${stability.oscillationReversals} reversals)` : "none detected"}`,
        stability.reason,
      ],
    });

    sections.push({
      heading: "Recommended Actions & Business Impact",
      lines:
        actionQueue.length > 0
          ? actionQueue.map((a) => `[Priority ${a.priority}, ${a.impactLevel}] ${a.text}`)
          : ["No recommended actions for this assessment."],
    });

    sections.push({
      heading: "Compliance References",
      lines: recommendations.flatMap((recommendation) => {
        const standards = standardsForRecommendation(recommendation.id);
        if (standards.length === 0) {
          return [];
        }
        return [
          `Recommendation: ${recommendation.text}`,
          ...standards.map((s) => `  aligns with ${s.code} - ${s.title}`),
          "",
        ];
      }),
    });

    sections.push({
      heading: "Timeline (preceding ticks)",
      lines:
        riskHistory && riskHistory.items.length > 0
          ? riskHistory.items.map(
              (h) => `${formatTimestamp(h.timestamp)}: ${h.tier.toUpperCase()} (${h.compound_risk_score.toFixed(1)})`,
            )
          : ["No preceding history available."],
    });

    sections.push({
      heading: "Digital Twin Snapshot",
      lines: [
        `Workers present: ${workerCount ?? "unknown"}`,
        `Equipment items: ${equipment?.length ?? 0}`,
        ...(equipment ?? []).map(
          (e) => `  ${e.equipment_type}: ${e.isolation_status}${e.maintenance_flag ? " (maintenance flagged)" : ""}`,
        ),
        `Active permits: ${activePermits?.items.length ?? 0}`,
      ],
    });

    sections.push({
      heading: "Historical Matches",
      lines: bestMatch
        ? [
            `Best match: ${bestMatch.incident_name} (similarity ${(bestMatch.similarity * 100).toFixed(0)}%)`,
            `Outcome tier: ${bestMatch.outcome_tier.toUpperCase()}`,
            `Root cause: ${bestMatch.root_cause}`,
          ]
        : ["No similar historical incidents found."],
    });

    sections.push({
      heading: "Operational Foresight",
      lines: foresight
        ? [
            `Early warning: ${foresight.early_warning.category} - ${foresight.early_warning.why}`,
            ...foresight.forecast.map((f) =>
              f.projected_risk !== null
                ? `+${f.horizon_minutes}min: ${f.projected_tier?.toUpperCase()} (${f.projected_risk.toFixed(1)})`
                : `+${f.horizon_minutes}min: Unavailable - ${f.unavailable_reason}`,
            ),
          ]
        : ["No forecast computed for this tick."],
    });

    sections.push({
      heading: "Knowledge Graph Summary",
      lines: subgraph
        ? [`${subgraph.nodes.length} connected entities, ${subgraph.edges.length} relationships.`]
        : ["Knowledge graph summary unavailable."],
    });

    sections.push({
      heading: "Counterfactual Comparison",
      lines: counterfactual
        ? [
            `Naive alarm system would have alerted: ${counterfactual.counterfactual.alert ? "Yes" : "No"}`,
            `Actual engine tier: ${counterfactual.compound?.tier.toUpperCase() ?? "unknown"}`,
          ]
        : ["No counterfactual comparison available for this tick."],
    });

    sections.push({
      heading: "Audit Trail",
      lines:
        auditEntries && auditEntries.items.length > 0
          ? auditEntries.items.map((e) => `${formatTimestamp(e.timestamp)}: ${e.event_type} (${e.actor})`)
          : ["No preceding audit entries for this zone."],
    });

    return sections;
  }

  return (
    <section>
      <p>
        <Link to={`/explain/${assessmentId ?? ""}`}>&larr; Explainability</Link> &middot;{" "}
        <Link to={`/decision-workspace/${assessmentId ?? ""}`}>Open Decision Workspace &rarr;</Link>
      </p>
      <h1>Decision Report</h1>
      <p className="page-intro">
        Every section below reads already-computed data from elsewhere in this platform - nothing
        is recomputed for this report.
      </p>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={!assessment}
        emptyLabel="Assessment not found."
        onRetry={() => refetch()}
      >
        {assessment && (
          <>
            <div className="card decision-report-toolbar">
              <label htmlFor="report-template-select">Report template</label>
              <select
                id="report-template-select"
                value={templateKind}
                onChange={(event) => setTemplateKind(event.target.value as ReportTemplateKind)}
              >
                {REPORT_TEMPLATES.map((template) => (
                  <option key={template.kind} value={template.kind}>
                    {template.label}
                  </option>
                ))}
              </select>
              <p className="kpi-sub">{getReportTemplate(templateKind).description}</p>
              <p className="kpi-sub">
                Includes: {getReportTemplate(templateKind).sectionHeadings.join(", ")}
              </p>
              <button type="button" onClick={handleExportPdf}>
                Export {getReportTemplate(templateKind).label} to PDF
              </button>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Executive Summary</h3>
              <p>
                <strong>{zoneLabel(assessment.zone_id, zones)}</strong> &middot;{" "}
                {formatTimestamp(assessment.timestamp)} &middot; {assessment.tier.toUpperCase()} (
                {assessment.compound_risk_score.toFixed(1)})
              </p>
              <p>{executiveExplanation}</p>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Confidence Breakdown</h3>
              <ConfidenceBreakdown factors={confidenceFactors} />
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Decision Stability</h3>
              <DecisionStabilityPanel stability={stability} />
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Recommended Actions</h3>
              <RecommendationList recommendations={recommendations} />
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Historical Matches</h3>
              <p>
                {bestMatch
                  ? `${bestMatch.incident_name} - similarity ${(bestMatch.similarity * 100).toFixed(0)}%`
                  : "No similar historical incidents found."}
              </p>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Operational Foresight</h3>
              <p>
                {foresight
                  ? `${foresight.early_warning.category} - ${foresight.early_warning.why}`
                  : "No forecast computed for this tick."}
              </p>
            </div>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Counterfactual Comparison</h3>
              <p>
                {counterfactual
                  ? `Naive alarm system would have alerted: ${counterfactual.counterfactual.alert ? "Yes" : "No"}`
                  : "No counterfactual comparison available for this tick."}
              </p>
            </div>

            <div className="card">
              <h3>Knowledge Graph Summary</h3>
              <p>
                {subgraph
                  ? `${subgraph.nodes.length} connected entities, ${subgraph.edges.length} relationships.`
                  : "Knowledge graph summary unavailable."}
              </p>
              <p>
                <Link to={`/knowledge-graph`}>Open Knowledge Graph &rarr;</Link>
              </p>
            </div>
          </>
        )}
      </QueryResult>
    </section>
  );
}
