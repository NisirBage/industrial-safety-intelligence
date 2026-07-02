import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { DashboardLayout } from "./components/layout/DashboardLayout";
import { PollingProvider } from "./context/PollingContext";
import { AuditPage } from "./pages/AuditPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PermitsPage } from "./pages/PermitsPage";
import { ZonePage } from "./pages/ZonePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PollingProvider>
        <BrowserRouter>
          <DashboardLayout>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/zones" element={<ZonePage />} />
              <Route path="/zones/:zoneId" element={<ZonePage />} />
              <Route path="/permits" element={<PermitsPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Routes>
          </DashboardLayout>
        </BrowserRouter>
      </PollingProvider>
    </QueryClientProvider>
  );
}

export default App;
