import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { PollingProvider } from "../context/PollingContext";

interface RenderOptions {
  /** The URL the MemoryRouter starts on. */
  initialRoute?: string;
  /** The route pattern `ui` is mounted at - only needs to differ
   * from the default catch-all when the component under test reads
   * a param via `useParams()` (e.g. ZonePage's `:zoneId`). */
  routePath?: string;
}

/**
 * Every component test renders through this rather than reaching for
 * `render()` directly, so each test gets an isolated QueryClient (no
 * cross-test cache leakage) and the same provider stack the real
 * `App.tsx` sets up - including a real `<Routes>` match, since
 * `useParams()` returns nothing without one.
 */
export function renderWithProviders(
  ui: ReactElement,
  { initialRoute = "/", routePath = "*" }: RenderOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PollingProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path={routePath} element={ui} />
          </Routes>
        </MemoryRouter>
      </PollingProvider>
    </QueryClientProvider>,
  );
}
