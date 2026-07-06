import type { ReactNode } from "react";

import { EmptyState, type EmptyStateAction } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

interface QueryResultProps {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyLabel: string;
  /** Part 7 (empty states) - optional richer context, passed straight
   * through to `EmptyState`. */
  emptyHint?: string;
  emptyAction?: EmptyStateAction;
  loadingLabel?: string;
  /** Part 8 (error states) - passed straight through to `ErrorState`;
   * omit when the caller's query hook has no `refetch` to offer. */
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * The one place that decides which of loading/error/empty/content to
 * show - every view (Overview, Zone, Permit, Audit) renders its data
 * through this rather than repeating the same four-way branch four
 * times.
 */
export function QueryResult({
  isLoading,
  error,
  isEmpty,
  emptyLabel,
  emptyHint,
  emptyAction,
  loadingLabel,
  onRetry,
  children,
}: QueryResultProps) {
  if (isLoading) {
    return <LoadingState label={loadingLabel} />;
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (isEmpty) {
    return <EmptyState label={emptyLabel} hint={emptyHint} action={emptyAction} />;
  }
  return <>{children}</>;
}
