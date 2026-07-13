/**
 * M28 Part 1 (Decision Workspace) - the 11-stage operational workflow
 * this page reorganizes existing data into. Every stage's content
 * comes from a hook or lib this app already has (ExplainabilityPage,
 * DecisionReportPage, HistoricalIntelligencePanel,
 * OperationalForesightPanel, RecommendationList, actionPlaybook) -
 * this file only names the stages and their order, it computes
 * nothing.
 */
export type WorkspaceStageId =
  | "situation"
  | "understand"
  | "evidence"
  | "historical"
  | "forecast"
  | "business_impact"
  | "options"
  | "recommended_action"
  | "approval"
  | "monitoring"
  | "export";

export interface WorkspaceStage {
  id: WorkspaceStageId;
  label: string;
}

export const WORKSPACE_STAGES: WorkspaceStage[] = [
  { id: "situation", label: "Situation" },
  { id: "understand", label: "Understand" },
  { id: "evidence", label: "Evidence" },
  { id: "historical", label: "Historical Context" },
  { id: "forecast", label: "Forecast" },
  { id: "business_impact", label: "Business Impact" },
  { id: "options", label: "Available Options" },
  { id: "recommended_action", label: "Recommended Action" },
  { id: "approval", label: "Approval" },
  { id: "monitoring", label: "Monitoring" },
  { id: "export", label: "Export" },
];

export const DEFAULT_WORKSPACE_STAGE: WorkspaceStageId = "situation";

export function isWorkspaceStageId(value: string | null): value is WorkspaceStageId {
  return value !== null && WORKSPACE_STAGES.some((stage) => stage.id === value);
}
