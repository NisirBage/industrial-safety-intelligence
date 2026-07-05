import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PresentationModeContextValue {
  active: boolean;
  enter: () => void;
  toggle: () => void;
  exit: () => void;
}

const PresentationModeContext = createContext<PresentationModeContextValue | null>(null);

export function usePresentationMode(): PresentationModeContextValue {
  const ctx = useContext(PresentationModeContext);
  if (!ctx) {
    throw new Error("usePresentationMode must be used within PresentationModeProvider");
  }
  return ctx;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Item 8 (presentation mode) - nav hidden, full-screen, large
 * typography, minimal controls, for projector use. `P` toggles it
 * from anywhere (except while typing into a field); `Escape` exits.
 * Purely a display/layout concern - touches no data, no risk value.
 */
export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);

  function enter() {
    setActive(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function exit() {
    setActive(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function toggle() {
    if (active) {
      exit();
    } else {
      enter();
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() === "p") {
        toggle();
      } else if (event.key === "Escape" && active) {
        exit();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    // The browser itself exits fullscreen on a native Escape before
    // our own keydown handler always runs - this keeps `active` in
    // sync with whatever actually happened, not just our own toggle.
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setActive(false);
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <PresentationModeContext.Provider value={{ active, enter, toggle, exit }}>
      {children}
    </PresentationModeContext.Provider>
  );
}
