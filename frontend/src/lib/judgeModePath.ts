import type { GraphEdge, GraphEntity, GraphNeighbor } from "../api/types";
import { edgeKey } from "./graphLayout";

export interface JudgeModeStep {
  label: string;
  entity: GraphEntity;
  /** null only for the anchor Risk Assessment step, which has no incoming edge to highlight. */
  edge: GraphEdge | null;
}

/**
 * M26 Part 13 (Judge Mode) - builds the illustrative "why" sequence
 * Sensor -> Agent -> Risk -> Historical Match -> Forecast ->
 * Recommendation from two real one-hop neighbor calls (a
 * RiskAssessment's own neighbors, plus its first triggered agent's
 * neighbors). Every step and edge is real data GraphService already
 * returns; this only orders it into a guided sequence. Steps whose
 * evidence doesn't exist for this particular tick (no historical
 * match, no forecast) are simply omitted, never fabricated.
 */
export function buildJudgeModeSteps(
  assessment: GraphEntity,
  assessmentNeighbors: GraphNeighbor[],
  agentNeighbors: GraphNeighbor[],
): JudgeModeStep[] {
  const steps: JudgeModeStep[] = [];

  const triggeredAgent = assessmentNeighbors.find(
    (n) => n.edge.relation === "triggered" && n.entity.kind === "triggered_agent",
  );

  if (triggeredAgent) {
    const sensor = agentNeighbors.find(
      (n) => n.edge.relation === "evidence" && n.entity.kind === "sensor",
    );
    if (sensor) {
      steps.push({ label: "Sensor evidence", entity: sensor.entity, edge: sensor.edge });
    }
    steps.push({
      label: "Contributing agent",
      entity: triggeredAgent.entity,
      edge: triggeredAgent.edge,
    });
  }

  steps.push({ label: "Risk assessment", entity: assessment, edge: null });

  const historicalMatch = assessmentNeighbors.find(
    (n) => n.edge.relation === "matched" && n.entity.kind === "historical_incident",
  );
  if (historicalMatch) {
    steps.push({
      label: "Historical match",
      entity: historicalMatch.entity,
      edge: historicalMatch.edge,
    });
  }

  const forecast = assessmentNeighbors.find(
    (n) => n.edge.relation === "projects_for" && n.entity.kind === "forecast",
  );
  if (forecast) {
    steps.push({ label: "Forecast", entity: forecast.entity, edge: forecast.edge });
  }

  const recommendation = assessmentNeighbors.find(
    (n) => n.edge.relation === "generated" && n.entity.kind === "recommendation",
  );
  if (recommendation) {
    steps.push({
      label: "Recommendation",
      entity: recommendation.entity,
      edge: recommendation.edge,
    });
  }

  return steps;
}

/** Re-exported so callers don't need to know Judge Mode's edge ids are
 * the same ones GraphCanvas renders. */
export const judgeModeEdgeId = edgeKey;
