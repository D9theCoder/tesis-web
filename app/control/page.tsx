import type { Metadata } from "next";

import { ControlPage } from "@/components/control/control-page";
import { loadControlSchema } from "@/lib/server/control/schema";

export const metadata: Metadata = {
  title: "Experiment control — TESIS",
  description: "Configure, launch, and cancel TESIS experiments from the web runtime control plane.",
};

/** The launch form is rendered from the local profile, so this page is per-request. */
export const dynamic = "force-dynamic";

export default async function Page() {
  // A failed read renders the page without a form; the client then loads it
  // itself and reports why. Blocking here instead would hide the page and its
  // header behind one error.
  const initialSchema = await loadControlSchema().catch(() => null);
  return <ControlPage initialSchema={initialSchema} />;
}
