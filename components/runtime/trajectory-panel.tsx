"use client";

import { useMemo } from "react";
import { Cpu, Route } from "lucide-react";
import type { LiveRunState } from "@/lib/schemas";
import { Badge } from "@/components/ui/primitives";
import { TrajectoryView } from "@/components/runtime/trajectory-view";
import { deriveTrajectory } from "@/lib/trajectory";
import { fmtNumber } from "@/lib/formatters";

export function TrajectoryPanel({ state }: { state: LiveRunState }) {
  const trajectory = useMemo(() => deriveTrajectory(state.events), [state.events]);
  const bufferUsed =
    state.metrics.generationBudget > 0
      ? state.metrics.generatedCandidates
      : state.metrics.attempts;

  return (
    <div className="runtime-panel">
      <header className="runtime-panel-header trajectory-panel-header">
        <div className="runtime-panel-title">
          <Route aria-hidden="true" size={17} />
          <h2>Trajectory</h2>
        </div>
      </header>

      <div className="trajectory-activity-bar" aria-live="polite">
        <span className="trajectory-entry-count">
          <Cpu aria-hidden="true" size={14} />
          {trajectory.stats.cells} {trajectory.stats.cells === 1 ? "record" : "records"}
        </span>
        <span className="trajectory-activity-separator" aria-hidden="true" />
        <span>{fmtNumber(state.metrics.tokenCount)} tokens</span>
        <Badge variant="outline" className="trajectory-budget">
          {bufferUsed} / {state.metrics.generationBudget || "Unlimited"} generation budget
        </Badge>
      </div>

      {state.events.length >= 300 && (
        <p className="helper-copy p-3">
          Recent activity preview. Use Experiment activity below for the complete paged journal.
        </p>
      )}
      <div className="runtime-panel-body trajectory-scroll">
        <TrajectoryView model={trajectory} />
      </div>
    </div>
  );
}
