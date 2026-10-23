"use client";

import { useCallback, useRef } from "react";
import { Moon, Sun, Terminal, type LucideIcon } from "lucide-react";
import type { Theme } from "@/lib/theme";
import { setTheme, useTheme } from "@/lib/use-theme";

type ThemeOption = {
  value: Theme;
  label: string;
  description: string;
  icon: LucideIcon;
};

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Standard palette for daylight review.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-light palette for sustained review.",
    icon: Moon,
  },
  {
    value: "hacker",
    label: "Hacker",
    description: "Terminal palette with rain and scanlines.",
    icon: Terminal,
  },
];

export function SettingsPanel() {
  const theme = useTheme();
  const inputs = useRef<Record<Theme, HTMLInputElement | null>>({
    light: null,
    dark: null,
    hacker: null,
  });

  const selectTheme = useCallback((next: Theme) => {
    setTheme(next, true);
    inputs.current[next]?.focus();
  }, []);

  return (
    <article className="settings-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Choose how the observer looks.</p>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="settings-appearance">
        <h2 className="settings-section-heading" id="settings-appearance">
          Appearance
        </h2>
        <fieldset className="theme-options" aria-label={`Theme: ${theme}`}>
          {THEME_OPTIONS.map(option => {
            const Icon = option.icon;
            const descriptionId = `theme-option-${option.value}-description`;
            return (
              <label key={option.value} className="theme-option">
                <input
                  ref={input => {
                    inputs.current[option.value] = input;
                  }}
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => selectTheme(option.value)}
                  aria-label={option.label}
                  aria-describedby={descriptionId}
                  className="theme-option-input"
                />
                <span className="theme-option-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="theme-option-body">
                  <span className="theme-option-title">{option.label}</span>
                  <span id={descriptionId} className="theme-option-description">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </section>
    </article>
  );
}
