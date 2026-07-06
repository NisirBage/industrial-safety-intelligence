import { ApiError } from "../../api/client";

interface ErrorStateProps {
  error: unknown;
  /** Part 8 (error states) - optional retry callback. Threaded from
   * React Query's own `refetch` at each call site; omitted entirely
   * for errors with no sensible retry (there are none today, but the
   * prop stays optional so a future non-retryable error path doesn't
   * need a fake no-op). */
  onRetry?: () => void;
}

function envelopeDetails(error: unknown): { code: string; message: string; status: number | null } {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
    status: null,
  };
}

/**
 * Friendly framing around the backend's own error envelope - M8's
 * requirement ("use the backend error envelope directly, never invent
 * a frontend error format") still holds: the exact `code`/`message`/
 * `status` are rendered verbatim, just inside a `<details>` disclosure
 * instead of as the primary, alarming-looking text. The primary text
 * is a plain-language framing plus a Retry button, never a fabricated
 * diagnosis of what went wrong.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { code, message, status } = envelopeDetails(error);
  const isNetwork = code === "NETWORK_ERROR" || code === "TIMEOUT";

  return (
    <div className="state state-error" role="alert">
      <p className="state-error-heading">
        {isNetwork ? "Couldn't reach the server" : "Something went wrong loading this data"}
      </p>
      <p className="state-error-friendly">
        {isNetwork
          ? "Check that the backend is running and reachable, then try again."
          : "This didn't load correctly. Try again, or check the details below if it keeps happening."}
      </p>
      {onRetry && (
        <button type="button" className="state-error-retry" onClick={onRetry}>
          Retry
        </button>
      )}
      <details className="state-error-details">
        <summary>Technical details</summary>
        <p className="state-error-code">{code}</p>
        <p>{message}</p>
        {status !== null && <p className="state-error-status">HTTP {status}</p>}
      </details>
    </div>
  );
}
