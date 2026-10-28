import { z } from "zod";

/**
 * Shared TypeScript schemas and types for the TESIS observer frontend.
 *
 * These mirror the Python runtime's event/descriptor/artifact contracts
 * (see `tesis/runtime_events.py`, the live-run descriptor and the artifact
 * layout). The server adapter validates its payloads with these schemas and
 * the browser uses the derived types. All schemas are additive/downgrading so
 * absent legacy fields remain tolerable.
 */

// ---------------------------------------------------------------------------
// Runtime event contract (RunEvent.as_dict)
// ---------------------------------------------------------------------------

export const runEventSchema = z.object({
  event_type: z.string(),
  name: z.string().optional(),
  timestamp: z.number().optional(),
  execution_id: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),
  node: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  candidate: z.unknown().nullable().optional(),
  message: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
}).passthrough();

export type RunEvent = z.infer<typeof runEventSchema>;

/** Cursor-based read of the redacted runtime journal. */
export const eventCursorResponseSchema = z.object({
  executionId: z.string(),
  events: z.array(runEventSchema),
  nextCursor: z.number(),
  status: z.string(),
  hasMore: z.boolean(),
  journalIdentity: z.string().optional(), reset: z.boolean().optional(), diagnostics: z.array(z.string()).optional(),
  executionStatus: z.enum(["completed", "failed", "interrupted"]).nullable().optional(),
  securityOutcome: z.enum(["confirmed", "no_finding", "unconfirmed", "fixture_limited"]).nullable().optional(),
  executionReason: z.record(z.unknown()).nullable().optional(), securityOutcomeReason: z.record(z.unknown()).nullable().optional(),
});

export type EventCursorResponse = z.infer<typeof eventCursorResponseSchema>;

// ---------------------------------------------------------------------------
// Run descriptor (runtime.json) and registry entries
// ---------------------------------------------------------------------------

export const runDescriptorSchema = z
  .object({
    schema_version: z.string().optional(),
    protocol_version: z.string().optional(),
    execution_id: z.string().nullable().optional(),
    run_id: z.string().nullable().optional(),
    exec_id: z.string().optional(),
    mode: z.enum(["single-run", "matrix", "single", "matrix-run"]).optional().or(z.string().optional()),
    matrix: z.boolean().optional(),
    status: z.string().optional(),
    started_at: z.string().optional(),
    ended_at: z.string().optional(),
    start_timestamp: z.number().optional(),
    experiment_dir: z.string().optional(),
    surface: z.string().optional(),
    target_method: z.string().nullable().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    security_level: z.string().optional(),
    payload_mode: z.string().optional(),
    experiment_condition: z.string().optional(),
    coordinate: z.record(z.unknown()).optional(),
    coordinate_label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    heartbeat_at: z.union([z.number(), z.string()]).nullable().optional(),
    updated_at: z.string().optional(),
    coordinates: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type RunDescriptor = z.infer<typeof runDescriptorSchema>;

export type RunConnectionStatus =
  | "waiting"
  | "active"
  | "stale"
  | "completed"
  | "cancelled"
  | "error";

/** Registry entry returned by GET /api/runtime/runs. */
export const runSummarySchema = z.object({
  executionId: z.string(),
  runId: z.string().nullable().optional(),
  mode: z.string(),
  directory: z.string(),
  status: z.string(),
  connection: z
    .enum(["active", "stale", "completed", "cancelled", "error", "waiting"])
    .optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  surface: z.string().nullable().optional(),
  securityLevel: z.string().nullable().optional(),
  payloadMode: z.string().nullable().optional(),
  experimentCondition: z.string().nullable().optional(),
  targetMethod: z.string().nullable().optional(),
  targetUrl: z.string().nullable().optional(),
  candidateBudget: z.number().optional(),
  maxIterations: z.number().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  hasJournal: z.boolean().optional(),
  hasManifest: z.boolean().optional(),
  hasArtifact: z.boolean().optional(),
  coordinateIndex: z.number().nullable().optional(),
  matrixExecutionId: z.string().nullable().optional(),
  isMatrixAggregate: z.boolean().optional(),
  repeatIndex: z.number().int().nullable().optional(),
  executionStatus: z.enum(["completed", "failed", "interrupted"]).nullable().optional(),
  securityOutcome: z.enum(["confirmed", "no_finding", "unconfirmed", "fixture_limited"]).nullable().optional(),
  executionReason: z.record(z.unknown()).nullable().optional(), securityOutcomeReason: z.record(z.unknown()).nullable().optional(),
  diagnostics: z.array(z.string()).optional(), sourceHash: z.string().nullable().optional(),
  eventCount: z.number().optional(),
  cursor: z.number().optional(),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

export const runListResponseSchema = z.object({
  runs: z.array(runSummarySchema),
  tesisRoot: z.string(),
  active: z.array(runSummarySchema).optional(),
  nextCursor: z.number().int().nullable().optional(), total: z.number().int().optional(), diagnostics: z.array(z.string()).optional(),
  workspace: z.record(z.number()).optional(),
});

export type RunListResponse = z.infer<typeof runListResponseSchema>;

// ---------------------------------------------------------------------------
// AKG snapshot
// ---------------------------------------------------------------------------

export type AkgNodeKind = "entry" | "surface" | "method" | "confirmed" | "outcome";

export interface AkgNodeState {
  active: boolean;
  visited: boolean;
  confirmed: boolean;
  chainEnabled: boolean;
  blocked: boolean;
  current: boolean;
}

export interface AkgNode {
  id: string;
  kind: AkgNodeKind;
  surface?: string;
  type: string;
  method?: string;
  label?: string;
  payloadProfile?: {
    payload_mode?: string;
    seed_payload_refs?: string[];
    allowed_mutation_types?: string[];
    target_params?: string[];
    expected_success_signals?: string[];
  };
}

export interface AkgEdge {
  id: string;
  source: string;
  target: string;
  isChain: boolean;
  preconditions: string[];
  targetAgent?: string;
  priority: number;
}

export interface AkgSnapshot {
  schema_version: string;
  nodes: AkgNode[];
  edges: AkgEdge[];
  source?: string;
  executionId?: string; ownerExecutionId?: string; sha256?: string; sourcePath?: string;
}

// ---------------------------------------------------------------------------
// Normalized results
// ---------------------------------------------------------------------------

export const scoreDimensionSchema = z.enum([
  "Smethod",
  "Spayload",
  "Sexploit",
  "Schain",
  "Soutput",
  "Srun",
]);

export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;

export interface ScoreRow {
  dimension: ScoreDimension;
  score: number | null;
  max: number;
  evidenceBasis: string;
  interpretation: string;
}

export interface EvidenceRow {
  id: string;
  timestamp: string; // ISO
  timestampEpoch: number;
  node: string | null;
  phase: string;
  method: string | null;
  route: string | null;
  action: string;
  candidate: unknown;
  result: string;
  status: "success" | "failure" | "info" | "safety" | "model";
  signal: string | null;
  safety: string;
  details: Record<string, unknown>;
  relatedEventIds: string[];
}

export interface CoordinateSummary {
  executionStatus: ExecutionStatus | null;
  securityOutcome: SecurityOutcome | null;
  executionReason: StatusReason | null;
  securityOutcomeReason: StatusReason | null;
  matrixExecutionId: string | null;
  repeatIndex: number | null;
  model?: string;
  hasArtifact?: boolean;
  historicalAnalysis: HistoricalAnalysis | null;
  runId: string | null;
  executionId: string;
  index: number;
  status: string;
  provider?: string;
  surface?: string;
  securityLevel?: string;
  payloadMode?: string;
  experimentCondition?: string;
  targetMethod?: string;
  selectedMethod: string | null;
  confirmedVulns: string[];
  achievedOutcomes: string[];
  scores: Partial<Record<ScoreDimension, number>>;
  artifactPath?: string;
}

export interface NormalizedResult {
  workflow?: WorkflowProgress | null;
  executionStatus: ExecutionStatus | null;
  securityOutcome: SecurityOutcome | null;
  executionReason: StatusReason | null;
  securityOutcomeReason: StatusReason | null;
  matrixExecutionId: string | null;
  repeatIndex: number | null;
  modelProfile?: string;
  source: SourceBinding | null;
  reviews: ReviewBundle | null;
  diagnostics: string[];
  historicalAnalysis: HistoricalAnalysis | null;
  coverage: Coverage | null;
  groupCoverages: Record<string, Coverage>;
  metricReadings: Record<string, MetricReading>;
  scoreOrigin: string;
  executionId: string;
  runId: string | null;
  mode: "single-run" | "matrix";
  status: string;
  taskResult: string | null;
  experimentOutcome: string | null;
  provider?: string;
  model?: string;
  surface?: string;
  securityLevel?: string;
  payloadMode?: string;
  experimentCondition?: string;
  targetMethod?: string;
  targetUrl?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  configFingerprint?: string;
  schemaVersion?: string;
  isMatrix: boolean;
  selectedMethod: string | null;
  viableMethods: string[];
  akgPath: string[];
  confirmedVulns: string[];
  achievedOutcomes: string[];
  scores: Partial<Record<ScoreDimension, number>>;
  scoringRows: ScoreRow[];
  evidenceRows: EvidenceRow[];
  coordinates: CoordinateSummary[];
  totalRuns?: number;
  successfulRuns?: number;
  errorRuns?: number;
  cancelledRuns?: number;
  skippedRuns?: number;
  metrics: {
    payloadValidityRate?: number;
    payloadExecutionSuccessRate?: number;
    payloadImprovementRate?: number;
    methodSelectionAccuracy?: number;
    adaptationRate?: number;
    guardrailActivationRate?: number;
    containmentCount?: number;
    guardrailActivations?: number;
    invalidJson?: number;
    fallbacks?: number;
    attemptsToSuccess?: number;
    tokenCost?: number;
    tokenCount?: number;
    llmCalls?: number;
  };
  raw: Record<string, unknown>;
}

export const executionStatusSchema = z.enum(["completed", "failed", "interrupted"]);
export const securityOutcomeSchema = z.enum(["confirmed", "no_finding", "unconfirmed", "fixture_limited"]);
export const candidateExecutionStatusSchema = z.enum(["executed", "not_executed"]);
export const candidateDispositionSchema = z.object({ candidate_id: z.string().optional(), execution_status: candidateExecutionStatusSchema.optional() }).passthrough();
export const reasonSchema = z.object({
  code: z.string(), detail: z.string().nullable().optional(), evidence_refs: z.array(z.string()).default([]),
}).passthrough();
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type SecurityOutcome = z.infer<typeof securityOutcomeSchema>;
export type StatusReason = z.infer<typeof reasonSchema>;
export const canonicalStatusSchema = z.object({
  executionStatus: executionStatusSchema.nullable(), securityOutcome: securityOutcomeSchema.nullable(),
  executionReason: reasonSchema.nullable(), securityOutcomeReason: reasonSchema.nullable(),
});
export const sourceBindingSchema = z.object({
  rootId: z.string(), path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  schema: z.string().nullable(), embeddedExecutionId: z.string().nullable().optional(),
  projection: z.object({ path: z.string(), sha256: z.string(), epoch: z.string() }).nullable().optional(),
});
export type SourceBinding = z.infer<typeof sourceBindingSchema>;
export const metricReadingSchema = z.object({
  value: z.number().finite().nullable(), available: z.boolean(), reason: z.string().nullable(),
  nAvailable: z.number().int().nonnegative().optional(), nUnavailable: z.number().int().nonnegative().optional(),
  unavailableReasons: z.record(z.number().int().nonnegative()).optional(),
});
export type MetricReading = z.infer<typeof metricReadingSchema>;
export const coverageSchema = z.object({
  represented: z.number().int().nonnegative(), planned: z.number().int().nonnegative().nullable(),
  unstarted: z.number().int().nonnegative().nullable(), completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(), interrupted: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), confirmed: z.number().int().nonnegative(),
  executionCounts: z.record(z.number().int().nonnegative()), outcomeCounts: z.record(z.number().int().nonnegative()),
  legacyTotals: z.record(z.unknown()).nullable(),
});
export type Coverage = z.infer<typeof coverageSchema>;
const componentSchema = z.object({
  Smethod: z.number().finite().min(0).max(4), Spayload: z.number().finite().min(0).max(4),
  Sexploit: z.number().finite().min(0).max(4), Schain: z.number().finite().min(0).max(4), Soutput: z.number().finite().min(0).max(4),
});
export const reviewMetricsSchema = z.object({
  values: z.record(z.number().finite().nullable()),
  availability: z.record(z.boolean()),
  unavailable_reason: z.record(z.string()),
  denominators: z.record(z.number().finite().nonnegative()),
});
export const reviewReceiptSchema = z.object({
  artifact_type: z.literal("thesis_score_receipt"), execution_id: z.string(), run_id: z.string().nullable().optional(),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/), source_path: z.string(),
  rubric_version: z.literal("scoring.v4"), scoring_mode: z.enum(["human", "ai"]), status: z.literal("final"),
  generated_at: z.string().datetime({ offset: true }), method: z.string(), config: z.record(z.unknown()),
  components: componentSchema, Spayload_final: z.number().finite().min(0).max(4), Srun_final: z.number().finite().min(0).max(4),
  numerator: z.number().finite().nonnegative(), denominator: z.number().int().positive(),
  candidate_grades: z.array(z.object({ candidate_id: z.string(), score: z.number().finite().min(0).max(4),
    evidence_refs: z.array(z.string()).optional() }).passthrough()),
  component_evidence_refs: z.record(z.array(z.string())), formula: componentSchema,
  metrics: reviewMetricsSchema.optional(),
}).passthrough();
export const reviewStatusSchema = z.object({
  artifact_type: z.literal("thesis_review_status"), source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  execution_id: z.string().optional(), source_path: z.string().optional(), generated_at: z.string().optional(),
  method: z.string(), rubric_version: z.string(), config: z.record(z.unknown()),
  decision_ledger_path: z.string().optional(), workflows: z.object({
    human: z.record(z.unknown()).optional(), ai: z.record(z.unknown()).optional(),
  }).passthrough(),
}).passthrough();
export const reviewWorkflowSchema = z.object({
  status: z.enum(["final", "pending", "missing", "stale", "unavailable"]), reason: z.string().nullable(),
  componentPendingReasons: z.record(z.unknown()), components: componentSchema.nullable(),
  SpayloadFinal: z.number().finite().nullable(), SrunFinal: z.number().finite().nullable(),
  rubric: z.string().nullable(), origin: z.string().nullable(), source: sourceBindingSchema.nullable(),
  numerator: z.number().nullable(), denominator: z.number().nullable(),
  candidateGrades: z.array(z.record(z.unknown())), evidenceRefs: z.record(z.array(z.string())),
  metrics: reviewMetricsSchema.nullable().optional(),
});
export type ReviewWorkflow = z.infer<typeof reviewWorkflowSchema>;
export const reviewBundleSchema = z.object({
  human: reviewWorkflowSchema, ai: reviewWorkflowSchema,
  history: z.array(z.object({ path: z.string(), sha256: z.string(), workflow: z.string(),
    accepted: z.boolean(), reason: z.string().nullable(), receipt: z.record(z.unknown()) })),
});
export type ReviewBundle = z.infer<typeof reviewBundleSchema>;
export const historicalAnalysisSchema = z.object({ classification: z.string(), source: z.string(), sha256: z.string(), epoch: z.string() });
export type HistoricalAnalysis = z.infer<typeof historicalAnalysisSchema>;
export const artifactSchema = z.object({
  execution_id: z.string(), schema_version: z.string().optional(), artifact_type: z.string().optional(),
  status: z.string().nullable().optional(), execution_status: executionStatusSchema.nullable().optional(),
  security_outcome: securityOutcomeSchema.nullable().optional(), execution_reason: reasonSchema.nullable().optional(),
  security_outcome_reason: reasonSchema.nullable().optional(), config: z.record(z.unknown()).optional(),
  candidate_dispositions: z.array(candidateDispositionSchema).optional(),
  final_state: z.object({ execution_status: executionStatusSchema.nullable().optional(), security_outcome: securityOutcomeSchema.nullable().optional(),
    execution_reason: reasonSchema.nullable().optional(), security_outcome_reason: reasonSchema.nullable().optional(),
    candidate_dispositions: z.array(candidateDispositionSchema).optional(),
  }).passthrough().nullable().optional(), runs: z.array(z.record(z.unknown())).optional(),
}).passthrough();
export const resultBundleSchema = z.object({
  schema_version: z.literal("observer-result.v1"), artifact: artifactSchema, source: sourceBindingSchema,
  reviews: reviewBundleSchema, diagnostics: z.array(z.string()),
  historicalAnalysis: historicalAnalysisSchema.nullable(), matrixExecutionId: z.string().nullable(),
  coordinateIndex: z.number().int().nonnegative().nullable(),
});
export const workflowProgressSchema = z.object({
  protocol_version: z.literal("workflow.v2"), iteration_unit: z.literal("method_visit"),
  iteration_count: z.number().int().nonnegative(), max_iterations: z.number().int().positive(),
  stop_policy: z.enum(["impact", "coverage"]), coverage_target: z.number().min(0).max(1),
  method_coverage: z.object({ attempted: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1), methods: z.array(z.string()) }),
  stop_reason: z.string().nullable(),
}).superRefine((value, context) => {
  const coverage = value.method_coverage;
  if (value.iteration_count > value.max_iterations || coverage.attempted > coverage.total
      || new Set(coverage.methods).size !== coverage.attempted
      || coverage.methods.length !== coverage.attempted
      || Math.abs(coverage.ratio - (coverage.total ? coverage.attempted / coverage.total : 0)) > 1e-9) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent workflow progress" });
  }
});
export type WorkflowProgress = z.infer<typeof workflowProgressSchema>;

export const normalizedResultSchema = z.object({
  workflow: workflowProgressSchema.nullable().optional(),
  executionId: z.string(), runId: z.string().nullable(), mode: z.enum(["single-run", "matrix"]), status: z.string(),
  executionStatus: executionStatusSchema.nullable(), securityOutcome: securityOutcomeSchema.nullable(),
  executionReason: reasonSchema.nullable(), securityOutcomeReason: reasonSchema.nullable(),
  scores: z.record(scoreDimensionSchema, z.number().finite().nullable()),
  scoringRows: z.array(z.object({ dimension: scoreDimensionSchema, score: z.number().finite().nullable(), max: z.number(),
    evidenceBasis: z.string(), interpretation: z.string() })),
  coordinates: z.array(z.object({ executionId: z.string(), runId: z.string().nullable(), index: z.number().int(),
    status: z.string(), executionStatus: executionStatusSchema.nullable(), securityOutcome: securityOutcomeSchema.nullable(),
  }).passthrough()),
  metrics: z.record(z.unknown()), metricReadings: z.record(metricReadingSchema),
  coverage: coverageSchema.nullable(), evidenceRows: z.array(z.object({ id: z.string(), relatedEventIds: z.array(z.string()), details: z.record(z.unknown()) }).passthrough()),
  reviews: reviewBundleSchema.nullable(), source: sourceBindingSchema.nullable(), diagnostics: z.array(z.string()),
}).passthrough();

// ---------------------------------------------------------------------------
// Live dashboard derived state
// ---------------------------------------------------------------------------

export interface ConversationEntry {
  id: string;
  role: "system" | "user" | "assistant" | "tool" | "trace";
  eventType: string;
  callId?: string;
  node: string | null;
  method: string | null;
  message: string | null;
  timestamp: number;
  data: Record<string, unknown>;
  coalesceKey?: string;
  tokens?: number;
}

export interface OutcomeMetrics {
  successes: number;
  failures: number;
  containmentCount: number;
  containmentViolations: number;
  guardrailCount: number;
  invalidJson: number;
  fallbacks: number;
  attempts: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  generatedCandidates: number;
  iterationCount: number;
  remainingBudget: number;
  generationBudget: number;
  remainingIterations: number;
  maxIterations: number;
  tokenCount: number | null;
  tokenCost: number | null;
}

export interface LiveRunState {
  workflow: WorkflowProgress | null;
  children: Record<string, LiveRunState>;
  executionStatus: ExecutionStatus | null;
  securityOutcome: SecurityOutcome | null;
  executionReason: StatusReason | null;
  securityOutcomeReason: StatusReason | null;
  journalIdentity: string | null;
  diagnostics: string[];
  cursor: number;
  lastPolledAt: number;
  status: string;
  connection: RunConnectionStatus;
  executionId: string | null;
  runId: string | null;
  mode: string;
  surface: string | null;
  securityLevel: string | null;
  provider: string | null;
  model: string | null;
  payloadMode: string | null;
  experimentCondition: string | null;
  targetMethod: string | null;
  targetUrl: string | null;
  currentNode: string | null;
  selectedMethod: string | null;
  viableMethods: string[];
  akgPath: string[];
  chain: string[];
  confirmedVulns: string[];
  achievedOutcomes: string[];
  startedAt: number | null;
  endedAt: number | null;
  elapsedMs: number;
  events: RunEvent[];
  conversation: ConversationEntry[];
  metrics: OutcomeMetrics;
  hasArtifact: boolean;
  artifactReady: boolean;
}
