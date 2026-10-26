import type { Metadata } from "next";

import { RuntimeSettings } from "@/components/settings/runtime-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const metadata: Metadata = {
  title: "Settings — TESIS",
  description: "Configure TESIS model providers, the AI scorer, experiment defaults, and appearance.",
};

export default function SettingsPage() {
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">
            Runtime configuration for experiments, models, and scoring, plus how this console looks on this device.
          </p>
        </div>
      </header>
      <RuntimeSettings />
      <SettingsPanel />
    </div>
  );
}
