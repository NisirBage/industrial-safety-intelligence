import { useEffect, useState } from "react";

const STORAGE_KEY = "isi-theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Part 1 (Industrial Design System - dark theme) - a single
 * `data-theme` attribute on `<html>` that every color token in
 * index.css already reads through (colors were tokenized since M0),
 * so no individual component needs its own dark-mode override.
 * Persists the user's explicit choice; defaults to the OS preference
 * on first visit. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  return { theme, toggle };
}
