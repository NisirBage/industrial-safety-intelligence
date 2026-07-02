/** Formatting helpers - presentation only, never a computation on a
 * risk value. */

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * No `/zones` endpoint exists (see docs/frontend/known-limitations.md)
 * - every response only carries a `zone_id` UUID, never a name. This
 * truncates it to a readable label rather than pretending a name is
 * available.
 */
export function shortZoneLabel(zoneId: string): string {
  return `Zone ${zoneId.slice(0, 8)}`;
}
