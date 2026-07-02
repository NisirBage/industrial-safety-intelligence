import { ApiError } from "../../api/client";

/**
 * Renders the backend's own error envelope directly (M8 requirement:
 * "Use the backend error envelope directly. Do not invent frontend
 * error formats."). `ApiError.code`/`message`/`details` are exactly
 * what src/api/common/errors.py's `ErrorDetail` carries, for every
 * failure that reached the backend at all; `NETWORK_ERROR` and
 * `TIMEOUT` are the two client-side codes the API client itself
 * assigns when a response never arrived to have an envelope in the
 * first place.
 */
export function ErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    return (
      <div className="state state-error" role="alert">
        <p className="state-error-code">{error.code}</p>
        <p>{error.message}</p>
        {error.status !== null && <p className="state-error-status">HTTP {error.status}</p>}
      </div>
    );
  }

  return (
    <div className="state state-error" role="alert">
      <p className="state-error-code">UNKNOWN_ERROR</p>
      <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
    </div>
  );
}
