import type { RiskAssessment } from "../api/types";

/**
 * The most recent item at or before `atTime` - a step function over
 * real, already-persisted rows, never an interpolated/smoothed value
 * between two of them. Backs the scenario replay timeline's "what was
 * this zone's state at this exact playback position" question the
 * same way `RiskHistoryChart`'s own straight-line-segments-only
 * rendering already refuses to fabricate a value the backend never
 * returned.
 */
export function assessmentAtOrBefore(
  history: RiskAssessment[],
  atTime: number,
): RiskAssessment | null {
  let best: RiskAssessment | null = null;
  for (const item of history) {
    const itemTime = new Date(item.timestamp).getTime();
    if (itemTime <= atTime && (best === null || itemTime > new Date(best.timestamp).getTime())) {
      best = item;
    }
  }
  return best;
}
