import type { ReactNode } from "react";

import { usePresentationMode } from "../../context/PresentationModeContext";
import { DemoModeBanner } from "./DemoModeBanner";
import { NavBar } from "./NavBar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { active, exit } = usePresentationMode();

  return (
    <div className={`dashboard-layout ${active ? "presentation-mode" : ""}`}>
      {!active && <NavBar />}
      {!active && <DemoModeBanner />}
      {active && (
        <button type="button" className="presentation-exit-button" onClick={exit}>
          Exit Presentation (Esc)
        </button>
      )}
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
