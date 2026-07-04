/**
 * The one centralized API layer (M8 requirement: "No fetch() calls
 * inside components. All API access goes through frontend/src/api/").
 * Every resource module (risk.ts, permits.ts, audit.ts) calls
 * `apiGet` here rather than calling `fetch` itself.
 *
 * Base URL comes from `VITE_API_BASE_URL` (see .env.example) so the
 * same build can point at a local backend or a deployed one without
 * a code change.
 */

import type { ErrorEnvelope } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Thrown for every non-2xx response and every transport failure.
 * Always carries the backend's own error envelope shape
 * (src/api/common/errors.py) when the backend produced one - the
 * frontend never invents a different error format. `code` is
 * "NETWORK_ERROR" or "TIMEOUT" for failures that never reached the
 * backend at all (no envelope exists to carry in that case).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | null;
  readonly status: number | null;

  constructor(
    message: string,
    code: string,
    status: number | null,
    details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : "";
}

async function parseErrorEnvelope(response: Response): Promise<ErrorEnvelope | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as ErrorEnvelope).error === "object"
    ) {
      return body as ErrorEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const envelope = await parseErrorEnvelope(response);
    if (envelope) {
      throw new ApiError(
        envelope.error.message,
        envelope.error.code,
        response.status,
        envelope.error.details ?? null,
      );
    }
    throw new ApiError(
      `Backend returned ${response.status} with a malformed response body.`,
      "MALFORMED_RESPONSE",
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ApiError(
      "Backend response was not valid JSON.",
      "MALFORMED_RESPONSE",
      response.status,
      { cause: String(cause) },
    );
  }
}

/**
 * GETs one JSON resource. Every caller (risk.ts/permits.ts/audit.ts)
 * goes through this - it is the only function in the entire frontend
 * that calls the global `fetch`.
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = `${BASE_URL}${path}${buildQueryString(params)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ApiError("Request timed out.", "TIMEOUT", null);
    }
    throw new ApiError(
      "Could not reach the backend.",
      "NETWORK_ERROR",
      null,
      { cause: String(cause) },
    );
  } finally {
    clearTimeout(timeout);
  }

  return handleResponse<T>(response);
}

/**
 * POSTs a JSON body and returns the JSON response - the Scenario
 * Builder's `/validate`/`/execute` calls are this frontend's first
 * ever write requests, so this is the first `apiPost` this client has
 * needed. Same timeout/error-envelope discipline as `apiGet`, just a
 * body and method added.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ApiError("Request timed out.", "TIMEOUT", null);
    }
    throw new ApiError(
      "Could not reach the backend.",
      "NETWORK_ERROR",
      null,
      { cause: String(cause) },
    );
  } finally {
    clearTimeout(timeout);
  }

  return handleResponse<T>(response);
}
