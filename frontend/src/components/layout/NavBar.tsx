import { NavLink } from "react-router-dom";

import { usePolling } from "../../context/PollingContext";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/zones", label: "Zones" },
  { to: "/permits", label: "Permits" },
  { to: "/audit", label: "Audit" },
];

export function NavBar() {
  const { intervalMs, setIntervalMs, enabled, setEnabled } = usePolling();

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
