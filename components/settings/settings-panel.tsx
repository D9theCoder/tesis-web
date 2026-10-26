"use client";

import { useCallback, useRef } from "react";
import { Moon, Sun, Terminal, type LucideIcon } from "lucide-react";
import styles from "./settings-panel.module.css";
import type { Theme } from "@/lib/theme";
import { CHEAT_CODE_PHRASE } from "@/lib/hacker-settings";
import { setTheme, useTheme } from "@/lib/use-theme";
import { useCheatCodeToggle, useCheatExitToggle } from "@/lib/use-hacker";

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
  const [cheatEnabled, setCheatEnabled] = useCheatCodeToggle();
  const [cheatExitEnabled, setCheatExitEnabled] = useCheatExitToggle();

  const selectTheme = useCallback((next: Theme) => {
    setTheme(next, true);
    inputs.current[next]?.focus();
  }, []);

  return (
    <article className={`settings-page ${styles.settingsPage}`}>
      <section className="settings-section" aria-labelledby="settings-appearance">
        <h2 className="settings-section-heading" id="settings-appearance">
          Appearance
        </h2>
        <fieldset
          className={`theme-options ${styles.themeOptions}`}
          aria-label={`Theme: ${theme}`}
        >
          {THEME_OPTIONS.map(option => {
            const Icon = option.icon;
            const descriptionId = `theme-option-${option.value}-description`;
            return (
              <label key={option.value} className={styles.themeOption}>
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
                  className={styles.themeRadio}
                />
                <span className={styles.themeIcon} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className={styles.themeOptionBody}>
                  <span className={styles.themeOptionTitle}>{option.label}</span>
                  <span id={descriptionId} className={styles.themeOptionDescription}>
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </section>

      <section className="settings-section" aria-labelledby="settings-cheat-code">
        <h2 className="settings-section-heading" id="settings-cheat-code">
          Cheat code
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={cheatEnabled}
          className="cheat-code-switch"
          onClick={() => setCheatEnabled(!cheatEnabled)}
        >
          <span className="cheat-code-switch__body">
            <span className="cheat-code-switch__title">“{CHEAT_CODE_PHRASE}” code</span>
            <span className="cheat-code-switch__description">
              Type “{CHEAT_CODE_PHRASE}” on any page to switch to hacker mode, cinematic
              splash included. Ignored while typing in a field.
            </span>
          </span>
          {/* Light and dark render a plain pill; hacker keeps the boxed chip. */}
          <span className="cheat-code-switch__pill" aria-hidden="true" />
          <span className="cheat-code-switch__state" aria-hidden="true">
            {cheatEnabled ? "ON" : "OFF"}
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={cheatExitEnabled}
          disabled={!cheatEnabled}
          className="cheat-code-switch cheat-code-switch--sub"
          onClick={() => setCheatExitEnabled(!cheatExitEnabled)}
        >
          <span className="cheat-code-switch__body">
            <span className="cheat-code-switch__title">Return with the code</span>
            <span className="cheat-code-switch__description">
              While hacker is active, typing “{CHEAT_CODE_PHRASE}” goes back to the theme
              you used before (light or dark), power-down included.
            </span>
          </span>
          <span className="cheat-code-switch__pill" aria-hidden="true" />
          <span className="cheat-code-switch__state" aria-hidden="true">
            {cheatExitEnabled ? "ON" : "OFF"}
          </span>
        </button>
      </section>
    </article>
  );
}
