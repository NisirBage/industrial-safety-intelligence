import type { Zone } from "../api/types";

/** Formatting helpers - presentation only, never a computation on a
 * risk value. */

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * M8 had no `/zones` endpoint (see docs/frontend/README.md's history)
 * - every response only carried a `zone_id` UUID, never a name. Kept
 * as the fallback `zoneLabel` below uses whenever a real name isn't
 * available yet (zones still loading, or an id `/zones` doesn't know
 * about).
 */
export function shortZoneLabel(zoneId: string): string {
  return `Zone ${zoneId.slice(0, 8)}`;
}

/**
 * Real zone name via the Decision Intelligence Layer's `GET /zones`
 * (`useZones()`), falling back to the truncated-UUID label rather
 * than blocking rendering on that request - every view already
 * renders zone-scoped data as soon as its own query resolves, so
 * this must never force it to wait on a second one too.
 */
export function zoneLabel(zoneId: string, zones: Zone[] | undefined): string {
  const zone = zones?.find((z) => z.zone_id === zoneId);
  return zone ? zone.name : shortZoneLabel(zoneId);
}
