import { Suspense } from "react";
import { ExperimentOverviewPage } from "@/components/experiment-overview";

export default function OverviewPage() {
  return <Suspense fallback={<p role="status">Loading research scope…</p>}><ExperimentOverviewPage /></Suspense>;
}
