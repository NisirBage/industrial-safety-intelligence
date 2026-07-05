import type { SceneTalkingPoints } from "../../lib/presentationScript";

/**
 * Part 8 (Guided Talking Points) - Judge Mode only. Every field comes
 * from `lib/presentationScript.ts::SCENE_TALKING_POINTS`, authored
 * presenter guidance condensed from `docs/presentation/demo_script.md`
 * - not generated here, not per-tick data.
 */
export function TalkingPointsPanel({ points }: { points: SceneTalkingPoints | undefined }) {
  if (!points) {
    return null;
  }

  return (
    <aside className="talking-points-panel" aria-label="Judge Mode talking points">
      <h3>Presenter Notes</h3>
      <p>{points.presenterNotes}</p>
      <h3>Judge Takeaway</h3>
      <p>{points.judgeTakeaway}</p>
      <h3>Technical Detail</h3>
      <p>{points.technicalDetail}</p>
      <h3>Business Value</h3>
      <p>{points.businessValue}</p>
    </aside>
  );
}
