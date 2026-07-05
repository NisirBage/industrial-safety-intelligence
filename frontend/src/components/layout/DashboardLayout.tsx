import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { usePresentationMode } from "../../context/PresentationModeContext";
import { DemoModeBanner } from "./DemoModeBanner";
import { NavBar } from "./NavBar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { active, exit } = usePresentationMode();
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  /* Part 3 (microinteractions) - a page-transition fade on every
     navigation, without forcing React to remount the routed page (a
     `key={pathname}` on this element would reset a page's own
     internal state - e.g. ZonePage's zone picker - on every param
     change, which this app never needed before). Re-triggering a CSS
     animation this way (remove class, force reflow, re-add) achieves
     the same visual effect with zero component-state risk. */
  useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }
    node.classList.remove("dashboard-content-transition");
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    node.offsetWidth;
    node.classList.add("dashboard-content-transition");
  }, [pathname]);

  return (
    <div className={`dashboard-layout ${active ? "presentation-mode" : ""}`}>
      {!active && <NavBar />}
      {!active && <DemoModeBanner />}
      {active && (
        <button type="button" className="presentation-exit-button" onClick={exit}>
          Exit Presentation (Esc)
        </button>
      )}
      <main className="dashboard-content dashboard-content-transition" ref={contentRef}>
        {children}
      </main>
    </div>
  );
}
