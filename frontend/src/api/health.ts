import { apiGet } from "./client";
import type { PlatformHealthResponse } from "./types";

/** Mirrors src/api/routers/health.py::HealthResponse. */
export interface HealthResponse {
  status: string;
  database: string;
  migration_version: string | null;
}

/** GET /api/v1/health. */
export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/api/v1/health");
}

/** GET /api/v1/health/platform - Enterprise Health Dashboard: live
 * status for every major subsystem this platform actually has. */
export function getPlatformHealth(): Promise<PlatformHealthResponse> {
  return apiGet<PlatformHealthResponse>("/api/v1/health/platform");
}
