import { describe, expect, it } from "vitest";

import type { GraphEdge, GraphEntity, GraphNeighbor } from "../api/types";
import { buildJudgeModeSteps, judgeModeEdgeId } from "./judgeModePath";

function entity(kind: GraphEntity["kind"], id: string, label = id): GraphEntity {
  return { kind, id, label, attributes: {} };
}

function neighbor(
  source: GraphEntity,
  relation: string,
  target: GraphEntity,
): GraphNeighbor {
  const edge: GraphEdge = {
    source_kind: source.kind,
    source_id: source.id,
    relation,
    target_kind: target.kind,
    target_id: target.id,
    label: target.label,
  };
  return { edge, entity: target };
}

describe("buildJudgeModeSteps", () => {
  const assessment = entity("risk_assessment", "a1");

  it("includes sensor and agent steps when a triggered agent with evidence exists", () => {
    const agent = entity("triggered_agent", "a1|gas_risk");
    const sensor = entity("sensor", "s1");
    const recommendation = entity("recommendation", "a1|tier_critical");

    const assessmentNeighbors = [
      neighbor(assessment, "triggered", agent),
      neighbor(assessment, "generated", recommendation),
    ];
    const agentNeighbors = [neighbor(agent, "evidence", sensor)];

    const steps = buildJudgeModeSteps(assessment, assessmentNeighbors, agentNeighbors);

    expect(steps.map((s) => s.label)).toEqual([
      "Sensor evidence",
      "Contributing agent",
      "Risk assessment",
      "Recommendation",
    ]);
    expect(steps[0].entity).toBe(sensor);
    expect(steps[2].edge).toBeNull();
  });

  it("omits historical match and forecast steps when neither exists for this tick", () => {
    const steps = buildJudgeModeSteps(assessment, [], []);
    expect(steps).toEqual([{ label: "Risk assessment", entity: assessment, edge: null }]);
  });

  it("includes historical match and forecast steps when present", () => {
    const incident = entity("historical_incident", "scenario-1");
    const forecast = entity("forecast", "zone-1|2026-01-01T00:00:00+00:00");
    const assessmentNeighbors = [
      neighbor(assessment, "matched", incident),
      neighbor(assessment, "projects_for", forecast),
    ];

    const steps = buildJudgeModeSteps(assessment, assessmentNeighbors, []);

    expect(steps.map((s) => s.label)).toEqual([
      "Risk assessment",
      "Historical match",
      "Forecast",
    ]);
  });
});

describe("judgeModeEdgeId", () => {
  it("matches GraphCanvas's own edge id format", () => {
    const edge: GraphEdge = {
      source_kind: "risk_assessment",
      source_id: "a1",
      relation: "triggered",
      target_kind: "triggered_agent",
      target_id: "a1|gas_risk",
      label: "gas risk",
    };
    expect(judgeModeEdgeId(edge)).toBe("risk_assessment:a1->triggered_agent:a1|gas_risk:triggered");
  });
});
