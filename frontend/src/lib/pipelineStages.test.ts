import { describe, expect, it } from "vitest";

import { agentStage, groupRulesByStage } from "./pipelineStages";

describe("groupRulesByStage", () => {
  it("groups rules into their originating stage, in pipeline order", () => {
    const result = groupRulesByStage([
      "saturating_threshold_function",
      "permit_status_escalated",
      "weighted_sum_fusion",
      "interaction_bonus_applied",
      "tier_stable",
    ]);
    expect(result.map((s) => s.stage)).toEqual([
      "Gas Risk Agent",
      "Permit Intelligence Agent",
      "Fusion",
      "Tiering",
    ]);
    expect(result.find((s) => s.stage === "Fusion")?.rules).toEqual([
      "weighted_sum_fusion",
      "interaction_bonus_applied",
    ]);
  });

  it("groups unrecognized rule identifiers under Unattributed instead of dropping them", () => {
    const result = groupRulesByStage(["some_future_rule_not_yet_mapped"]);
    expect(result).toEqual([{ stage: "Unattributed", rules: ["some_future_rule_not_yet_mapped"] }]);
  });

  it("returns an empty array for no rules", () => {
    expect(groupRulesByStage([])).toEqual([]);
  });
});

describe("agentStage", () => {
  it("maps each known agent name to its stage", () => {
    expect(agentStage("gas_risk")).toBe("Gas Risk Agent");
    expect(agentStage("permit_intelligence")).toBe("Permit Intelligence Agent");
  });

  it("falls back to Unattributed for an unknown agent name", () => {
    expect(agentStage("some_future_agent")).toBe("Unattributed");
  });
});
