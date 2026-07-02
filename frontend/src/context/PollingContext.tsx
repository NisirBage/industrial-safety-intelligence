import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const DEFAULT_POLLING_INTERVAL_MS = 5000;

interface PollingContextValue {
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const PollingContext = createContext<PollingContextValue | null>(null);

/**
 * The one place the dashboard's polling interval lives - every data
 * hook (useCurrentRisk, useRiskHistory, usePermits, useAuditLog)
 * reads `intervalMs`/`enabled` from here via `usePolling()` rather
 * than each hardcoding its own refetch interval, so a user's choice
 * (or a pause) applies uniformly across the whole dashboard.
 */
export function PollingProvider({ children }: { children: ReactNode }) {
  const [intervalMs, setIntervalMs] = useState(DEFAULT_POLLING_INTERVAL_MS);
  const [enabled, setEnabled] = useState(true);

  const value = useMemo(
    () => ({ intervalMs, setIntervalMs, enabled, setEnabled }),
    [intervalMs, enabled],
  );

  return <PollingContext.Provider value={value}>{children}</PollingContext.Provider>;
}

export function usePolling(): PollingContextValue {
  const context = useContext(PollingContext);
  if (context === null) {
    throw new Error("usePolling() must be called within a PollingProvider");
  }
  return context;
}

export { DEFAULT_POLLING_INTERVAL_MS };
