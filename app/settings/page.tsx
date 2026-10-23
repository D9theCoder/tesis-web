import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const metadata: Metadata = {
  title: "Settings — TESIS Observer",
  description: "Choose how TESIS Observer looks on this device.",
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
