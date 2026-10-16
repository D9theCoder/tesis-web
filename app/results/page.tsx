import { Suspense } from "react";
import { ExperimentInventoryPage } from "@/components/experiment-inventory";

export default function ResultsCatalogPage() {
  return <Suspense fallback={<p role="status">Loading experiment inventory…</p>}><ExperimentInventoryPage /></Suspense>;
}
