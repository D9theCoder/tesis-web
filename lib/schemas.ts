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
});

export type RunEvent = z.infer<typeof runEventSchema>;

/** Cursor-based read of the redacted runtime journal. */
export const eventCursorResponseSchema = z.object({
  executionId: z.string(),
  events: z.array(runEventSchema),
  nextCursor: z.number(),
  status: z.string(),
  hasMore: z.boolean(),
});

export type EventCursorResponse = z.infer<typeof eventCursorResponseSchema>;

// ---------------------------------------------------------------------------
// Run descriptor (runtime.json) and registry entries
// ---------------------------------------------------------------------------

export const runDescriptorSchema = z
  .object({
    schema_version: z.string().optional(),
    protocol_version: z.string().optional(),
    execution_id: z.string().optional(),
    run_id: z.string().optional(),
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
    heartbeat_at: z.union([z.number(), z.string()]).optional(),
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
  eventCount: z.number().optional(),
  cursor: z.number().optional(),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

export const runListResponseSchema = z.object({
  runs: z.array(runSummarySchema),
  tesisRoot: z.string(),
  active: z.array(runSummarySchema).optional(),
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
  score: number;
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

export const normalizedResultSchema = z.record(z.unknown());

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
  tokenCount: number;
  tokenCost: number;
}

export interface LiveRunState {
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
