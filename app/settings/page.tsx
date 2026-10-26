import type { Metadata } from "next";

import { RuntimeSettings } from "@/components/settings/runtime-settings";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { loadControlSchema } from "@/lib/server/control/schema";

export const metadata: Metadata = {
  title: "Settings — TESIS",
  description: "Configure TESIS model providers, the AI scorer, experiment defaults, and appearance.",
};

/** The runtime form is rendered from the local profile, so this page is per-request. */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // A failed read renders the page without the runtime form; the client then
  // loads it itself and reports why.
  const initialSchema = await loadControlSchema().catch(() => null);
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
      <RuntimeSettings initialSchema={initialSchema} />
      <SettingsPanel />
    </div>
  );
}
