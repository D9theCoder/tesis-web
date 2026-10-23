"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { applyTheme, persistTheme, THEME_KEY, THEME_TRANSITION_CLASS, type Theme } from "@/lib/theme";

let sessionTheme: Theme | null = null;
const subscribeTheme = (callback: () => void) => {
  const changed = () => { sessionTheme = null; callback(); };
  window.addEventListener("storage", changed);
  window.addEventListener("tesis-theme", callback);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener("tesis-theme", callback); };
};
const getTheme = (): Theme => {
  if (sessionTheme) return sessionTheme;
  try { return (localStorage.getItem(THEME_KEY) ?? localStorage.getItem("tesis-theme")) === "dark" ? "dark" : "light"; } catch { return "light"; }
};
const serverTheme = (): Theme => "light";

/**
 * The only component subscribed to the theme preference, so switching themes
 * updates the control without re-rendering the application shell or monitor.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, serverTheme);
  useEffect(() => {
    const current = getTheme();
    if (document.documentElement.dataset.theme !== current) applyTheme(current);
  }, [theme]);

  return (
    <Button className="ui-button-icon" variant="ghost" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={() => {
      if (document.documentElement.classList.contains(THEME_TRANSITION_CLASS)) return;
      const next: Theme = theme === "light" ? "dark" : "light";
      sessionTheme = next;
      persistTheme(next);
      applyTheme(next, true);
      window.dispatchEvent(new Event("tesis-theme"));
    }}>
      <span className="theme-toggle-icon" aria-hidden="true">
        <span className="theme-icon theme-icon-sun"><Sun size={17} /></span>
        <span className="theme-icon theme-icon-moon"><Moon size={17} /></span>
      </span>
    </Button>
  );
}
