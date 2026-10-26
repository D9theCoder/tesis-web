import { z } from "zod";

/**
 * Shared contract for the runtime control plane.
 *
 * Responses originate in the TESIS bridge, so object schemas stay permissive:
 * the web validates what it renders without breaking when the runtime adds a
 * field. Request schemas are strict, because they are the write path.
 */

export const controlFieldSchema = z
  .object({
    path: z.string(),
    label: z.string(),
    category: z.string(),
    kind: z.string(),
    valueType: z.string(),
    choices: z.array(z.string()).default([]),
    default: z.unknown().nullish(),
    value: z.unknown().nullish(),
    secret: z.boolean().default(false),
    multiple: z.boolean().default(false),
    required: z.boolean().default(false),
    minValue: z.number().nullish(),
    maxValue: z.number().nullish(),
    description: z.string().default(""),
    forms: z.array(z.string()).default([]),
  })
  .passthrough();

export type ControlField = z.infer<typeof controlFieldSchema>;

export const modelProfileSchema = z.object({ id: z.string(), label: z.string() });
export type ModelProfile = z.infer<typeof modelProfileSchema>;

export const jobStatusSchema = z.enum([
  "running",
  "cancelling",
  "finished",
  "failed",
  "cancelled",
  "lost",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobKindSchema = z.enum(["run", "doctor"]);
export const jobModeSchema = z.enum(["single", "matrix", "doctor-offline", "doctor-live"]);

export const controlJobSchema = z
  .object({
    id: z.string(),
    kind: jobKindSchema,
    mode: jobModeSchema,
    status: jobStatusSchema,
    createdAt: z.string(),
    startedAt: z.string().nullish(),
    endedAt: z.string().nullish(),
    pid: z.number().nullish(),
    exitCode: z.number().nullish(),
    signal: z.string().nullish(),
    argv: z.array(z.string()).default([]),
    configPath: z.string().default(""),
    result: z.record(z.unknown()).nullish(),
    error: z.string().nullish(),
    cancelRequestedAt: z.string().nullish(),
    artifactDir: z.string().nullish(),
    executionId: z.string().nullish(),
    runId: z.string().nullish(),
    logBytes: z.number().default(0),
  })
  .passthrough();

export type ControlJob = z.infer<typeof controlJobSchema>;

export const controlProviderSummarySchema = z
  .object({
    id: z.string(),
    displayName: z.string().default(""),
    protocol: z.string().default(""),
    baseUrl: z.string().default(""),
    fetchUrl: z.string().default(""),
    models: z.array(z.string()).default([]),
    keyRef: z.string().default(""),
    hasKey: z.boolean().default(false),
  })
  .passthrough();

export type ControlProviderSummary = z.infer<typeof controlProviderSummarySchema>;

export const controlScoringSummarySchema = z
  .object({
    mode: z.string().default("human"),
    rubricVersion: z.string().default("scoring.v4"),
    configured: z.boolean().default(false),
    evaluator: z
      .object({
        provider: z.string().default(""),
        model: z.string().default(""),
        maxAttempts: z.union([z.number(), z.string()]).default(2),
        maxTokens: z.union([z.number(), z.string()]).default(1024),
        timeout: z.union([z.number(), z.string()]).default(60),
      })
      .default({}),
  })
  .passthrough();

export type ControlScoringSummary = z.infer<typeof controlScoringSummarySchema>;

export const controlRuntimeSummarySchema = z
  .object({
    maxConcurrency: z.union([z.number(), z.string()]).default(1),
    cacheScope: z.string().default("none"),
    roles: z.record(z.record(z.unknown())).default({}),
  })
  .passthrough();

export const controlGuardrailSummarySchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.string().default("reactive"),
    maxRetries: z.union([z.number(), z.string()]).default(3),
    cooldownThreshold: z.union([z.number(), z.string()]).default(5),
  })
  .passthrough();

export const controlTargetSummarySchema = z
  .object({
    url: z.string().default(""),
    username: z.string().default(""),
    passwordSet: z.boolean().default(false),
  })
  .passthrough();

export const controlSchemaResponse = z
  .object({
    configPath: z.string(),
    sourceConfigPath: z.string(),
    profileExists: z.boolean(),
    yaml: z.string(),
    preservedSecretCount: z.number().default(0),
    fields: z.array(controlFieldSchema).default([]),
    forms: z.record(z.array(z.string())).default({}),
    categories: z.array(z.string()).default([]),
    modelProfiles: z.array(modelProfileSchema).default([]),
    resolved: z.record(z.unknown()).nullish(),
    resolvedError: z.string().nullish(),
    fieldErrors: z.record(z.string()).default({}),
    warnings: z.array(z.string()).default([]),
    providers: z.array(controlProviderSummarySchema).default([]),
    scoring: controlScoringSummarySchema.nullish(),
    llmRuntime: controlRuntimeSummarySchema.nullish(),
    guardrails: controlGuardrailSummarySchema.nullish(),
    target: controlTargetSummarySchema.nullish(),
    control: z
      .object({ enabled: z.boolean(), reason: z.string().nullish() })
      .optional(),
    activeJob: controlJobSchema.nullish(),
  })
  .passthrough();

export type ControlSchema = z.infer<typeof controlSchemaResponse>;

export const controlCoordinateSchema = z
  .object({
    index: z.number(),
    provider: z.string().nullish(),
    level: z.string().nullish(),
    surface: z.string().nullish(),
    payloadMode: z.string().nullish(),
    repeat: z.number().nullish(),
  })
  .passthrough();

export type ControlCoordinate = z.infer<typeof controlCoordinateSchema>;

export const controlValidationResponse = z
  .object({
    valid: z.boolean(),
    error: z.string().nullish(),
    fieldErrors: z.record(z.string()).default({}),
    resolved: z.record(z.unknown()).nullish(),
    coordinates: z.array(controlCoordinateSchema).default([]),
    totalCoordinates: z.number().default(0),
  })
  .passthrough();

export type ControlValidation = z.infer<typeof controlValidationResponse>;

export const controlSaveResponse = z
  .object({
    saved: z.boolean(),
    error: z.string().nullish(),
    yaml: z.string().optional(),
    resolved: z.record(z.unknown()).nullish(),
    resolvedError: z.string().nullish(),
    fieldErrors: z.record(z.string()).default({}),
  })
  .passthrough();

export type ControlSaveResult = z.infer<typeof controlSaveResponse>;

export const controlSyncResponse = z
  .object({ written: z.boolean(), error: z.string().nullish(), path: z.string().optional(), backup: z.string().optional() })
  .passthrough();

export const controlJobListResponse = z.object({ jobs: z.array(controlJobSchema) });

export const controlJobLogResponse = z.object({
  text: z.string(),
  nextOffset: z.number(),
  complete: z.boolean(),
});

export type ControlJobLog = z.infer<typeof controlJobLogResponse>;

export const controlAuthResponse = z
  .object({
    available: z.boolean().optional(),
    error: z.string().nullish(),
    status: z.record(z.unknown()).optional(),
    models: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

export const discoveredModelSchema = z
  .object({ id: z.string(), display_name: z.string().optional() })
  .passthrough();

export const controlModelsResponse = z
  .object({
    fetched: z.boolean(),
    error: z.string().nullish(),
    models: z.array(discoveredModelSchema).default([]),
  })
  .passthrough();

export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;

/** Doctor report emitted by `tesis doctor --json`. */
export const doctorCheckSchema = z
  .object({
    id: z.string(),
    category: z.string().default(""),
    status: z.string(),
    summary: z.string().default(""),
    details: z.string().default(""),
    remediation: z.string().default(""),
  })
  .passthrough();

export const doctorReportSchema = z
  .object({
    status: z.string(),
    summary: z
      .object({
        passed: z.number().default(0),
        failed: z.number().default(0),
        skipped: z.number().default(0),
        total: z.number().default(0),
      })
      .passthrough(),
    checks: z.array(doctorCheckSchema).default([]),
  })
  .passthrough();

export type DoctorReport = z.infer<typeof doctorReportSchema>;

// ---------------------------------------------------------------------------
// Requests (strict: these mutate state)
// ---------------------------------------------------------------------------

const yamlDocument = z.string().min(1, "A YAML document is required.").max(512_000);

const secretMap = z.record(z.string().max(8192)).refine(
  (value) => Object.keys(value).every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)),
  { message: "Secret names must be valid environment variable names." },
);

/** Dotted configuration paths mapped to typed values (null removes a key). */
const overrideMap = z.record(z.unknown());

export const controlValidateRequest = z.object({
  yaml: yamlDocument,
  form: z.enum(["settings", "single", "matrix"]).optional(),
  overrides: overrideMap.optional(),
});

export const controlSaveRequest = z.object({
  yaml: yamlDocument,
  secrets: secretMap.optional(),
  overrides: overrideMap.optional(),
  /** Provider ID → API key; the bridge derives the .env variable name. */
  apiProviderKeys: secretMap.optional(),
});

export const controlStartRequest = z.object({
  mode: z.enum(["single", "matrix"]),
  yaml: yamlDocument.optional(),
  secrets: secretMap.optional(),
  overrides: overrideMap.optional(),
  apiProviderKeys: secretMap.optional(),
});

export const controlDoctorRequest = z.object({ live: z.boolean().optional() });

export const controlModelsRequest = z.object({
  providerId: z.string().max(64).optional(),
  baseUrl: z.string().max(2048).optional(),
  protocol: z.enum(["openai", "openai_compatible", "anthropic"]).optional(),
  fetchUrl: z.string().max(2048).optional(),
  apiKey: z.string().max(8192).optional(),
});

export const controlAuthQuery = z.object({
  action: z.enum(["status", "models"]).default("status"),
  account: z.string().max(64).default("default"),
});
