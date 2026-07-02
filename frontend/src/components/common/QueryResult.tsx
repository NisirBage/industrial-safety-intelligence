import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

interface QueryResultProps {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyLabel: string;
  loadingLabel?: string;
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
  loadingLabel,
  children,
}: QueryResultProps) {
  if (isLoading) {
    return <LoadingState label={loadingLabel} />;
  }
  if (error) {
    return <ErrorState error={error} />;
  }
  if (isEmpty) {
    return <EmptyState label={emptyLabel} />;
  }
  return <>{children}</>;
}
