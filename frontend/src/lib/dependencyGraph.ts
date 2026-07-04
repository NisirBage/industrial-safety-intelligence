import type { PrioritizedAction } from "./actionPlaybook";

export interface DependencyGraphLevel {
  level: number;
  actions: PrioritizedAction[];
}

/**
 * Item 3 (Operational Dependency Graph) - a pure topological layering
 * over `PrioritizedAction.dependencyLabels` (itself already computed
 * by `buildActionQueue` from the same `dependsOn` config the Action
 * Queue's own "Dependencies" field reads) - the two views can never
 * disagree because they share one source of truth. An action with no
 * dependencies present this tick sits at level 0; everything else sits
 * one level below the deepest dependency it actually has this tick.
 */
export function buildDependencyLevels(actions: PrioritizedAction[]): DependencyGraphLevel[] {
  const levelById = new Map<string, number>();
  const byId = new Map(actions.map((action) => [action.id, action]));

  function levelOf(actionId: string, visiting: Set<string>): number {
    if (levelById.has(actionId)) {
      return levelById.get(actionId) as number;
    }
    if (visiting.has(actionId)) {
      // A configuration cycle would be an authoring error, not
      // something that should hang the UI - treat it as level 0.
      return 0;
    }
    const action = byId.get(actionId);
    // A dependency id this queue doesn't actually contain isn't a real
    // dependency right now (the recommendation it names simply isn't
    // active this tick) - filtered out here too, defensively, even
    // though `buildActionQueue` already pre-filters `dependencyLabels`
    // to present ids, so this function's own contract holds regardless
    // of what a caller passes it.
    const presentDeps = action?.dependencyLabels.filter((depId) => byId.has(depId)) ?? [];
    if (!action || presentDeps.length === 0) {
      levelById.set(actionId, 0);
      return 0;
    }
    visiting.add(actionId);
    const level = 1 + Math.max(...presentDeps.map((depId) => levelOf(depId, visiting)));
    visiting.delete(actionId);
    levelById.set(actionId, level);
    return level;
  }

  for (const action of actions) {
    levelOf(action.id, new Set());
  }

  const levels = new Map<number, PrioritizedAction[]>();
  for (const action of actions) {
    const level = levelById.get(action.id) ?? 0;
    const bucket = levels.get(level) ?? [];
    bucket.push(action);
    levels.set(level, bucket);
  }

  return Array.from(levels.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, levelActions]) => ({ level, actions: levelActions }));
}
