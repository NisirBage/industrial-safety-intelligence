/** Pure helpers for the Time Machine's replay cursor - no state, no
 * React, so `ReplayContext`'s "jump to a timestamp" behavior can be
 * unit-tested without mounting a provider. */

/** Index of the timestamp in `timestamps` closest to `target` (by
 * absolute time difference) - "jump to timestamp" never requires an
 * exact match, since a user-picked instant rarely lands on a real
 * persisted tick. Returns 0 for an empty list (caller's own concern
 * to guard against, matching how every other index-based accessor in
 * this codebase behaves). */
export function findNearestTimestampIndex(timestamps: string[], target: string): number {
  if (timestamps.length === 0) {
    return 0;
  }
  const targetMs = new Date(target).getTime();
  let bestIndex = 0;
  let bestDelta = Infinity;
  timestamps.forEach((ts, index) => {
    const delta = Math.abs(new Date(ts).getTime() - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Deduplicated, ascending-sorted union of every zone's assessment
 * timestamps - the Time Machine's shared tick axis. */
export function mergeTimestamps(perZoneTimestamps: string[][]): string[] {
  const set = new Set<string>();
  for (const timestamps of perZoneTimestamps) {
    for (const ts of timestamps) {
      set.add(ts);
    }
  }
  return [...set].sort();
}
