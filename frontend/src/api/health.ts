import { apiGet } from "./client";

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
