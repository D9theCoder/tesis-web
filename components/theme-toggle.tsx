"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { THEME_TRANSITION_CLASS } from "@/lib/theme";
import { setTheme, useTheme } from "@/lib/use-theme";

/**
 * Header quick control, deliberately limited to light and dark. Hacker is
 * selected on Settings only, never from the navigation bar. The icon shows the
 * next action: light offers moon/dark, dark offers sun/light, and hacker offers
 * sun/light so the header never presents a hacker control.
 */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "light" ? "dark" : "light";

  return (
    <Button
      className="ui-button-icon theme-toggle"
      variant="ghost"
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme}. Switch to ${next}.`}
      onClick={() => {
        if (document.documentElement.classList.contains(THEME_TRANSITION_CLASS)) return;
        setTheme(next, true);
      }}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <span className="theme-icon theme-icon-sun"><Sun size={17} /></span>
        <span className="theme-icon theme-icon-moon"><Moon size={17} /></span>
      </span>
    </Button>
  );
}
