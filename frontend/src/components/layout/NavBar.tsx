import { NavLink } from "react-router-dom";

import { useDemoMode } from "../../context/DemoModeContext";
import { usePolling } from "../../context/PollingContext";
import { usePresentationMode } from "../../context/PresentationModeContext";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/digital-twin", label: "Digital Twin" },
  { to: "/operations", label: "Operations Center" },
  { to: "/executive", label: "Executive" },
  { to: "/zones", label: "Zones" },
  { to: "/permits", label: "Permits" },
  { to: "/audit", label: "Audit" },
  { to: "/scenarios", label: "Scenarios" },
  { to: "/scenario-builder", label: "Scenario Builder" },
  { to: "/time-machine", label: "Time Machine" },
  { to: "/counterfactual", label: "Counterfactual" },
  { to: "/journal", label: "Journal" },
  { to: "/comparison", label: "Comparison" },
];

export function NavBar() {
  const { intervalMs, setIntervalMs, enabled, setEnabled } = usePolling();
  const { active, loading, startDemo } = useDemoMode();
  const { toggle: togglePresentationMode } = usePresentationMode();

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
