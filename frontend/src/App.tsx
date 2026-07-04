import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { DashboardLayout } from "./components/layout/DashboardLayout";
import { DemoModeProvider } from "./context/DemoModeContext";
import { PollingProvider } from "./context/PollingContext";
import { PresentationModeProvider } from "./context/PresentationModeContext";
import { ReplayProvider } from "./context/ReplayContext";
import { AuditPage } from "./pages/AuditPage";
import { CounterfactualPage } from "./pages/CounterfactualPage";
import { DecisionComparisonPage } from "./pages/DecisionComparisonPage";
import { DecisionJournalPage } from "./pages/DecisionJournalPage";
import { DigitalTwinPage } from "./pages/DigitalTwinPage";
import { ExecutiveOverviewPage } from "./pages/ExecutiveOverviewPage";
import { ExplainabilityPage } from "./pages/ExplainabilityPage";
import { OperationsCenterPage } from "./pages/OperationsCenterPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PermitsPage } from "./pages/PermitsPage";
import { ResearchModePage } from "./pages/ResearchModePage";
import { ScenarioBuilderPage } from "./pages/ScenarioBuilderPage";
import { ScenarioLibraryPage } from "./pages/ScenarioLibraryPage";
import { ScenarioReplayPage } from "./pages/ScenarioReplayPage";
import { TimeMachinePage } from "./pages/TimeMachinePage";
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
          <PresentationModeProvider>
            <DemoModeProvider>
              <ReplayProvider>
                <DashboardLayout>
                  <Routes>
                    <Route path="/" element={<OverviewPage />} />
                    <Route path="/digital-twin" element={<DigitalTwinPage />} />
                    <Route path="/zones" element={<ZonePage />} />
                    <Route path="/zones/:zoneId" element={<ZonePage />} />
                    <Route path="/permits" element={<PermitsPage />} />
                    <Route path="/audit" element={<AuditPage />} />
                    <Route path="/scenarios" element={<ScenarioLibraryPage />} />
                    <Route path="/scenario-builder" element={<ScenarioBuilderPage />} />
                    <Route path="/scenarios/:key" element={<ScenarioReplayPage />} />
                    <Route path="/explain/:assessmentId" element={<ExplainabilityPage />} />
                    <Route path="/counterfactual" element={<CounterfactualPage />} />
                    <Route path="/counterfactual/:zoneId" element={<CounterfactualPage />} />
                    <Route path="/executive" element={<ExecutiveOverviewPage />} />
                    <Route path="/research/:assessmentId" element={<ResearchModePage />} />
                    <Route path="/journal" element={<DecisionJournalPage />} />
                    <Route path="/comparison" element={<DecisionComparisonPage />} />
                    <Route path="/time-machine" element={<TimeMachinePage />} />
                    <Route path="/operations" element={<OperationsCenterPage />} />
                  </Routes>
                </DashboardLayout>
              </ReplayProvider>
            </DemoModeProvider>
          </PresentationModeProvider>
        </BrowserRouter>
      </PollingProvider>
    </QueryClientProvider>
  );
}

export default App;
