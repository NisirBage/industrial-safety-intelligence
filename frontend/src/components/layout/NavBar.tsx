import { NavLink } from "react-router-dom";

import { useDemoMode } from "../../context/DemoModeContext";
import { useJudgeQuickView } from "../../context/JudgeQuickViewContext";
import { usePolling } from "../../context/PollingContext";
import { usePresentationMode } from "../../context/PresentationModeContext";
import { ThemeToggle } from "../common/ThemeToggle";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/mission-control", label: "Mission Control" },
  { to: "/story", label: "Story Demo" },
  { to: "/digital-twin", label: "Digital Twin" },
  { to: "/operations", label: "Operations Center" },
  { to: "/executive", label: "Executive" },
  { to: "/zones", label: "Zones" },
  { to: "/permits", label: "Work Authorizations" },
  { to: "/audit", label: "Audit" },
  { to: "/scenarios", label: "Scenarios" },
  { to: "/scenario-builder", label: "Scenario Builder" },
  { to: "/time-machine", label: "Time Machine" },
  { to: "/decision-timeline", label: "Decision Timeline" },
  { to: "/challenge-mode", label: "Challenge Mode" },
  { to: "/demo-timeline", label: "Demo Timeline" },
  { to: "/counterfactual", label: "Alternative Decision" },
  { to: "/journal", label: "Journal" },
  { to: "/comparison", label: "Comparison" },
  { to: "/demo-launcher", label: "Demo Launcher" },
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/knowledge-graph", label: "Knowledge Graph" },
  { to: "/live-integration", label: "Live Integration Hub" },
  { to: "/enterprise", label: "Enterprise Operations" },
  { to: "/platform-health", label: "Platform Health" },
  { to: "/ceo-dashboard", label: "CEO Dashboard" },
  { to: "/replay-comparison", label: "Replay Comparison" },
];

export function NavBar() {
  const { intervalMs, setIntervalMs, enabled, setEnabled } = usePolling();
  const { active, loading, startDemo } = useDemoMode();
  const { toggle: togglePresentationMode } = usePresentationMode();
  const { activate: activateJudgeQuickView } = useJudgeQuickView();

  return (
    <header className="nav-bar">
      <span className="nav-bar-title">Industrial Safety Intelligence</span>
      <nav>
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        className="global-search-trigger"
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        title="Search everything (Ctrl+K / Cmd+K)"
      >
        Search <kbd>Ctrl</kbd>+<kbd>K</kbd>
      </button>
      <button
        type="button"
        className="judge-quick-view-button"
        onClick={activateJudgeQuickView}
        title="One click: replay, presentation mode, Mission Control, talking points"
      >
        Judge Quick View
      </button>
      <button type="button" className="start-demo-button" onClick={startDemo} disabled={active || loading}>
        {loading ? "Preparing…" : "Start Demo"}
      </button>
      <button
        type="button"
        className="presentation-toggle-button"
        onClick={togglePresentationMode}
        title="Presentation mode (P)"
      >
        Presentation Mode
      </button>
      <ThemeToggle />
      <div className="polling-controls">
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Live polling
        </label>
        <label>
          Interval (s)
          <input
            type="number"
            min={1}
            max={60}
            value={intervalMs / 1000}
            disabled={!enabled}
            onChange={(event) => {
              const seconds = Number(event.target.value);
              if (Number.isFinite(seconds) && seconds >= 1) {
                setIntervalMs(seconds * 1000);
              }
            }}
          />
        </label>
      </div>
    </header>
  );
}
