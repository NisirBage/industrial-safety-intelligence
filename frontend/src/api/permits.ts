import { apiGet } from "./client";
import type { Paginated, Permit, PermitsQuery } from "./types";

/** GET /api/v1/permits - optionally filtered by zone and/or status. */
export function getPermits(query: PermitsQuery = {}): Promise<Paginated<Permit>> {
  return apiGet<Paginated<Permit>>("/api/v1/permits", query);
}
