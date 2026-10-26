import type { Metadata } from "next";

import { ControlPage } from "@/components/control/control-page";

export const metadata: Metadata = {
  title: "Experiment control — TESIS",
  description: "Configure, launch, and cancel TESIS experiments from the web runtime control plane.",
};

export default function Page() {
  return <ControlPage />;
}
