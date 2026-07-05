import { useTheme } from "../../hooks/useTheme";

/** Sun/moon glyphs, not emoji - consistent stroke weight with every
 * other icon in this codebase (plant map icons, permit glyphs). */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
      <circle cx={0} cy={0} r={3.5} fill="none" stroke="currentColor" strokeWidth={1.4} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <line
          key={angle}
          x1={0}
          y1={-5.5}
          x2={0}
          y2={-7}
          stroke="currentColor"
          strokeWidth={1.4}
          transform={`rotate(${angle})`}
        />
      ))}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
      <path
        d="M 4 -6 A 6 6 0 1 0 4 6 A 4.6 4.6 0 0 1 4 -6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button type="button" className="theme-toggle-button" onClick={toggle} aria-label={nextLabel} title={nextLabel}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
