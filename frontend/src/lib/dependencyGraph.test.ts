import { describe, expect, it } from "vitest";

import type { PrioritizedAction } from "./actionPlaybook";
import { buildDependencyLevels } from "./dependencyGraph";

function action(overrides: Partial<PrioritizedAction>): PrioritizedAction {
  return {
    id: "x",
    text: "x",
    severity: "high",
    priority: 1,
    metadata: {
      eta: "1 minute",
      dependsOn: [],
      requiredPersonnel: "Operator",
      requiredEquipment: null,
      targetedFactor: "tier",
      baseImpact: "MODERATE",
    },
    impactLevel: "MODERATE",
    dependencyLabels: [],
    ...overrides,
  };
}

describe("buildDependencyLevels", () => {
  it("puts an action with no dependencies at level 0", () => {
    const levels = buildDependencyLevels([action({ id: "a", dependencyLabels: [] })]);
    expect(levels).toEqual([{ level: 0, actions: [expect.objectContaining({ id: "a" })] }]);
  });

  it("chains dependent actions into increasing levels", () => {
    const levels = buildDependencyLevels([
      action({ id: "suspend", dependencyLabels: [] }),
      action({ id: "evacuate", dependencyLabels: ["suspend"] }),
      action({ id: "isolate", dependencyLabels: ["evacuate"] }),
    ]);
    expect(levels.map((l) => l.level)).toEqual([0, 1, 2]);
    expect(levels[0].actions.map((a) => a.id)).toEqual(["suspend"]);
    expect(levels[1].actions.map((a) => a.id)).toEqual(["evacuate"]);
    expect(levels[2].actions.map((a) => a.id)).toEqual(["isolate"]);
  });

  it("places an action with a dependency that isn't present in the queue at level 0, not deeper", () => {
    const levels = buildDependencyLevels([
      action({ id: "orphan", dependencyLabels: ["nonexistent"] }),
    ]);
    expect(levels).toEqual([{ level: 0, actions: [expect.objectContaining({ id: "orphan" })] }]);
  });

  it("groups multiple actions at the same level together", () => {
    const levels = buildDependencyLevels([
      action({ id: "a", dependencyLabels: [] }),
      action({ id: "b", dependencyLabels: [] }),
    ]);
    expect(levels).toHaveLength(1);
    expect(levels[0].actions.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });

  it("does not hang on a configuration cycle - treats it as level 0", () => {
    const levels = buildDependencyLevels([
      action({ id: "a", dependencyLabels: ["b"] }),
      action({ id: "b", dependencyLabels: ["a"] }),
    ]);
    expect(levels.length).toBeGreaterThan(0);
  });
});
