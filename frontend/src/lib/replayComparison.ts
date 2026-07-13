/**
 * M28 Part 4 (Replay Comparison Mode) - the current incident and a
 * historical incident are two different real events with two
 * different real durations, so they can't share one wall-clock
 * cursor. Instead both sides scrub together by *relative progress*
 * (0 = each incident's own start, 1 = each incident's own end) - a
 * single shared fraction mapped independently onto each side's own
 * real `start_time`/`end_time`. This is the only new computation in
 * this file: plain arithmetic over two already-real timestamps, never
 * a risk, tier, or confidence value.
 */
export function timeAtFraction(startIso: string, endIso: string, fraction: number): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const clamped = Math.min(1, Math.max(0, fraction));
  return start + clamped * (end - start);
}
