import type {
  EventCursorResponse,
  NormalizedResult,
  RunListResponse,
  RunSummary,
} from "@/lib/schemas";
import type { AkgMockSimulation } from "@/lib/akg-mock";
import { runListResponseSchema, runSummarySchema, eventCursorResponseSchema } from "@/lib/schemas";
import { normalizeResult } from "@/lib/result-normalizer";
import { experimentListSchema, experimentOverviewSchema } from "@/lib/experiment-contract";
import {
  controlAuthFlowResponse,
  controlAuthResponse,
  controlJobListResponse,
  controlJobLogResponse,
  controlJobSchema,
  controlModelsResponse,
  controlSaveResponse,
  controlSchemaResponse,
  controlSyncResponse,
  controlValidationResponse,
  type ControlAuthFlow,
  type ControlJob,
  type ControlSchema,
} from "@/lib/control-contract";

/** Browser-safe read-only client for the observer route handlers. */

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** Register of observed runs plus the newest active descriptor, if any. */
export async function fetchRuns(signal?: AbortSignal, cursor = 0, query = ""): Promise<RunListResponse> {
  return runListResponseSchema.parse(await getJson(`/api/runtime/runs?cursor=${cursor}${query ? `&${query}` : ""}`, signal));
}

export async function fetchExperiments(query: string, signal?: AbortSignal, fresh = false) {
  return experimentListSchema.parse(await getJson(`/api/experiments?${query}${fresh ? `${query ? "&" : ""}fresh=1` : ""}`, signal));
}

export async function fetchExperimentOverview(query: string, signal?: AbortSignal, fresh = false) {
  return experimentOverviewSchema.parse(await getJson(`/api/experiments/overview?${query}${fresh ? `${query ? "&" : ""}fresh=1` : ""}`, signal));
}

export async function fetchRunSummary(
  executionId: string,
  signal?: AbortSignal,
): Promise<RunSummary | null> {
  try {
    return runSummarySchema.parse(await getJson(`/api/runtime/runs/${encodeURIComponent(executionId)}`, signal));
  } catch {
    return null;
  }
}

export async function fetchEvents(
  executionId: string,
  cursor: number,
  signal?: AbortSignal,
  journalIdentity?: string | null,
): Promise<EventCursorResponse> {
  return eventCursorResponseSchema.parse(await getJson(
    `/api/runtime/runs/${encodeURIComponent(executionId)}/events?cursor=${cursor}${journalIdentity ? `&journal=${encodeURIComponent(journalIdentity)}` : ""}`,
    signal,
  ));
}

export async function fetchResult(
  executionId: string,
  signal?: AbortSignal,
): Promise<NormalizedResult | null> {
  try {
    const raw = await getJson<Record<string, unknown>>(
      `/api/results/${encodeURIComponent(executionId)}`,
      signal,
    );
    return normalizeResult(raw, (raw as { mode?: string }).mode);
  } catch {
    return null;
  }
}

export async function fetchCoordinateResult(
  executionId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<NormalizedResult | null> {
  try {
    const raw = await getJson<Record<string, unknown>>(
      `/api/results/${encodeURIComponent(executionId)}/coordinates/${encodeURIComponent(runId)}`,
      signal,
    );
    return normalizeResult(raw, "single-run");
  } catch {
    return null;
  }
}

export async function fetchAkg(signal?: AbortSignal, executionId?: string): Promise<Record<string, unknown>> {
  return getJson<Record<string, unknown>>(`/api/akg${executionId ? `?executionId=${encodeURIComponent(executionId)}` : ""}`, signal);
}

/** Load the checked-in YAML fixture used by the dashboard's mock traversal. */
export async function fetchAkgMock(signal?: AbortSignal): Promise<AkgMockSimulation> {
  return getJson<AkgMockSimulation>("/api/mock/akg", signal);
}

// ---------------------------------------------------------------------------
// Runtime control plane
// ---------------------------------------------------------------------------

/** JSON request helper mirroring {@link getJson}, for the control routes. */
async function sendJson<T>(
  url: string,
  method: "POST" | "DELETE",
  body: unknown,
  schema: { parse: (value: unknown) => T },
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const detail =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return schema.parse(payload);
}

export async function fetchControlSchema(signal?: AbortSignal): Promise<ControlSchema> {
  return controlSchemaResponse.parse(await getJson("/api/control/schema", signal));
}

export async function validateControlDraft(body: {
  yaml: string;
  form?: string;
  overrides?: Record<string, unknown>;
}, signal?: AbortSignal) {
  return sendJson("/api/control/config/validate", "POST", body, controlValidationResponse, signal);
}

export async function saveControlConfig(body: {
  yaml: string;
  secrets?: Record<string, string>;
  overrides?: Record<string, unknown>;
  apiProviderKeys?: Record<string, string>;
}) {
  return sendJson("/api/control/config/save", "POST", body, controlSaveResponse);
}

export async function syncControlToCheckout() {
  return sendJson("/api/control/config/sync", "POST", {}, controlSyncResponse);
}

export async function discoverProviderModels(body: {
  providerId?: string;
  baseUrl?: string;
  protocol?: string;
  fetchUrl?: string;
  apiKey?: string;
}) {
  return sendJson("/api/control/config/models", "POST", body, controlModelsResponse);
}

export async function fetchChatGPTAccount(action: "status" | "models", account = "default") {
  return controlAuthResponse.parse(
    await getJson(`/api/control/auth?action=${encodeURIComponent(action)}&account=${encodeURIComponent(account)}`),
  );
}

/** Current or last supervised ChatGPT account action, without spawning Python. */
export async function fetchChatGPTAuthFlow(signal?: AbortSignal): Promise<ControlAuthFlow> {
  return controlAuthFlowResponse.parse(
    await getJson("/api/control/auth?action=flow", signal),
  ).flow;
}

export async function startChatGPTAuth(
  action: "login" | "logout",
  account = "default",
): Promise<ControlAuthFlow> {
  return (
    await sendJson("/api/control/auth", "POST", { action, account }, controlAuthFlowResponse)
  ).flow;
}

export async function cancelChatGPTAuth(account = "default"): Promise<ControlAuthFlow> {
  return (
    await sendJson("/api/control/auth", "POST", { action: "cancel", account }, controlAuthFlowResponse)
  ).flow;
}

export async function fetchControlJobs(limit = 25, signal?: AbortSignal) {
  return controlJobListResponse.parse(await getJson(`/api/control/runs?limit=${limit}`, signal));
}

export async function fetchControlJob(jobId: string, signal?: AbortSignal): Promise<ControlJob> {
  const payload = await getJson<{ job: unknown }>(`/api/control/runs/${encodeURIComponent(jobId)}`, signal);
  return controlJobSchema.parse(payload.job);
}

export async function startControlRun(body: {
  mode: "single" | "matrix";
  yaml?: string;
  secrets?: Record<string, string>;
  overrides?: Record<string, unknown>;
  apiProviderKeys?: Record<string, string>;
}): Promise<{ job: ControlJob; saved: boolean }> {
  const payload = await sendJson<{ job: unknown; saved: boolean }>("/api/control/runs", "POST", body, {
    parse: (value) => value as { job: unknown; saved: boolean },
  });
  return { job: controlJobSchema.parse(payload.job), saved: payload.saved };
}

export async function cancelControlRun(jobId: string, force = false): Promise<ControlJob> {
  const payload = await sendJson<{ job: unknown }>(
    `/api/control/runs/${encodeURIComponent(jobId)}${force ? "?force=1" : ""}`,
    "DELETE",
    undefined,
    { parse: (value) => value as { job: unknown } },
  );
  return controlJobSchema.parse(payload.job);
}

export async function fetchControlLog(jobId: string, offset: number, signal?: AbortSignal) {
  return controlJobLogResponse.parse(
    await getJson(`/api/control/runs/${encodeURIComponent(jobId)}/log?offset=${offset}`, signal),
  );
}

export async function startDoctorRun(live = false): Promise<ControlJob> {
  const payload = await sendJson<{ job: unknown }>("/api/control/doctor", "POST", { live }, {
    parse: (value) => value as { job: unknown },
  });
  return controlJobSchema.parse(payload.job);
}
