import { apiGet } from "./client";
import type { Zone, ZoneWorkerCount } from "./types";

/** GET /api/v1/zones - plant metadata, Decision Intelligence Layer. */
export function getZones(): Promise<Zone[]> {
  return apiGet<Zone[]>("/api/v1/zones");
}

/** GET /api/v1/zones/{zoneId}/workers/count - raw headcount, not a
 * risk value (Presentation Layer milestone). */
export function getZoneWorkerCount(zoneId: string): Promise<ZoneWorkerCount> {
  return apiGet<ZoneWorkerCount>(`/api/v1/zones/${zoneId}/workers/count`);
}
