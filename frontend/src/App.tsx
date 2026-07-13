import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { LoadingState } from "./components/common/LoadingState";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { DemoModeProvider } from "./context/DemoModeContext";
import { JudgeQuickViewProvider } from "./context/JudgeQuickViewContext";
import { PollingProvider } from "./context/PollingContext";
import { PresentationModeProvider } from "./context/PresentationModeContext";
import { ReplayProvider } from "./context/ReplayContext";
import { OverviewPage } from "./pages/OverviewPage";

/**
 * M20 Part 9 (Performance) - every route except the default landing
 * page (`OverviewPage`, loaded eagerly so the first paint has no
 * extra network round-trip) is code-split via `React.lazy`. This is
 * purely a bundling change - each page's own behavior, data fetching,
 * and rendering are unchanged; only when its JS chunk downloads
 * changes (on first navigation to that route, not on initial load).
 */
const MissionControlPage = lazy(() =>
  import("./pages/MissionControlPage").then((m) => ({ default: m.MissionControlPage })),
);
const DigitalTwinPage = lazy(() =>
  import("./pages/DigitalTwinPage").then((m) => ({ default: m.DigitalTwinPage })),
);
const ZonePage = lazy(() => import("./pages/ZonePage").then((m) => ({ default: m.ZonePage })));
const PermitsPage = lazy(() =>
  import("./pages/PermitsPage").then((m) => ({ default: m.PermitsPage })),
);
const AuditPage = lazy(() => import("./pages/AuditPage").then((m) => ({ default: m.AuditPage })));
const ScenarioLibraryPage = lazy(() =>
  import("./pages/ScenarioLibraryPage").then((m) => ({ default: m.ScenarioLibraryPage })),
);
const ScenarioBuilderPage = lazy(() =>
  import("./pages/ScenarioBuilderPage").then((m) => ({ default: m.ScenarioBuilderPage })),
);
const ScenarioReplayPage = lazy(() =>
  import("./pages/ScenarioReplayPage").then((m) => ({ default: m.ScenarioReplayPage })),
);
const ExplainabilityPage = lazy(() =>
  import("./pages/ExplainabilityPage").then((m) => ({ default: m.ExplainabilityPage })),
);
const CounterfactualPage = lazy(() =>
  import("./pages/CounterfactualPage").then((m) => ({ default: m.CounterfactualPage })),
);
const ExecutiveOverviewPage = lazy(() =>
  import("./pages/ExecutiveOverviewPage").then((m) => ({ default: m.ExecutiveOverviewPage })),
);
const ResearchModePage = lazy(() =>
  import("./pages/ResearchModePage").then((m) => ({ default: m.ResearchModePage })),
);
const DecisionJournalPage = lazy(() =>
  import("./pages/DecisionJournalPage").then((m) => ({ default: m.DecisionJournalPage })),
);
const DecisionComparisonPage = lazy(() =>
  import("./pages/DecisionComparisonPage").then((m) => ({ default: m.DecisionComparisonPage })),
);
const TimeMachinePage = lazy(() =>
  import("./pages/TimeMachinePage").then((m) => ({ default: m.TimeMachinePage })),
);
const DecisionTimelinePage = lazy(() =>
  import("./pages/DecisionTimelinePage").then((m) => ({ default: m.DecisionTimelinePage })),
);
const ChallengeModePage = lazy(() =>
  import("./pages/ChallengeModePage").then((m) => ({ default: m.ChallengeModePage })),
);
const DemoTimelinePage = lazy(() =>
  import("./pages/DemoTimelinePage").then((m) => ({ default: m.DemoTimelinePage })),
);
const OperationsCenterPage = lazy(() =>
  import("./pages/OperationsCenterPage").then((m) => ({ default: m.OperationsCenterPage })),
);
const PresentationModePage = lazy(() =>
  import("./pages/PresentationModePage").then((m) => ({ default: m.PresentationModePage })),
);
const DemoLauncherPage = lazy(() =>
  import("./pages/DemoLauncherPage").then((m) => ({ default: m.DemoLauncherPage })),
);
const DiagnosticsPage = lazy(() =>
  import("./pages/DiagnosticsPage").then((m) => ({ default: m.DiagnosticsPage })),
);
const KnowledgeGraphPage = lazy(() =>
  import("./pages/KnowledgeGraphPage").then((m) => ({ default: m.KnowledgeGraphPage })),
);
const DecisionReportPage = lazy(() =>
  import("./pages/DecisionReportPage").then((m) => ({ default: m.DecisionReportPage })),
);
const LiveIntegrationHubPage = lazy(() =>
  import("./pages/LiveIntegrationHubPage").then((m) => ({ default: m.LiveIntegrationHubPage })),
);
const EnterpriseOperationsPage = lazy(() =>
  import("./pages/EnterpriseOperationsPage").then((m) => ({ default: m.EnterpriseOperationsPage })),
);
const PlatformHealthPage = lazy(() =>
  import("./pages/PlatformHealthPage").then((m) => ({ default: m.PlatformHealthPage })),
);
const CeoDashboardPage = lazy(() =>
  import("./pages/CeoDashboardPage").then((m) => ({ default: m.CeoDashboardPage })),
);
const DecisionWorkspacePage = lazy(() =>
  import("./pages/DecisionWorkspacePage").then((m) => ({ default: m.DecisionWorkspacePage })),
);
const ReplayComparisonPage = lazy(() =>
  import("./pages/ReplayComparisonPage").then((m) => ({ default: m.ReplayComparisonPage })),
);

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
                <JudgeQuickViewProvider>
                  <DashboardLayout>
                    <Suspense fallback={<LoadingState label="Loading page..." />}>
                      <Routes>
                        <Route path="/" element={<OverviewPage />} />
                        <Route path="/mission-control" element={<MissionControlPage />} />
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
                        <Route path="/decision-timeline" element={<DecisionTimelinePage />} />
                        <Route path="/challenge-mode" element={<ChallengeModePage />} />
                        <Route path="/demo-timeline" element={<DemoTimelinePage />} />
                        <Route path="/operations" element={<OperationsCenterPage />} />
                        <Route path="/story" element={<PresentationModePage />} />
                        <Route path="/demo-launcher" element={<DemoLauncherPage />} />
                        <Route path="/diagnostics" element={<DiagnosticsPage />} />
                        <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
                        <Route
                          path="/decision-report/:assessmentId"
                          element={<DecisionReportPage />}
                        />
                        <Route path="/live-integration" element={<LiveIntegrationHubPage />} />
                        <Route path="/enterprise" element={<EnterpriseOperationsPage />} />
                        <Route path="/platform-health" element={<PlatformHealthPage />} />
                        <Route path="/ceo-dashboard" element={<CeoDashboardPage />} />
                        <Route
                          path="/decision-workspace/:assessmentId"
                          element={<DecisionWorkspacePage />}
                        />
                        <Route path="/replay-comparison" element={<ReplayComparisonPage />} />
                      </Routes>
                    </Suspense>
                  </DashboardLayout>
                </JudgeQuickViewProvider>
              </ReplayProvider>
            </DemoModeProvider>
          </PresentationModeProvider>
        </BrowserRouter>
      </PollingProvider>
    </QueryClientProvider>
  );
}

export default App;
