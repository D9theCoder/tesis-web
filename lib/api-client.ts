import type {
  EventCursorResponse,
  NormalizedResult,
  RunListResponse,
  RunSummary,
} from "@/lib/schemas";
import type { AkgMockSimulation } from "@/lib/akg-mock";
import { normalizeResult } from "@/lib/result-normalizer";

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
export async function fetchRuns(signal?: AbortSignal): Promise<RunListResponse> {
  return getJson<RunListResponse>("/api/runtime/runs", signal);
}

export async function fetchRunSummary(
  executionId: string,
  signal?: AbortSignal,
): Promise<RunSummary | null> {
  try {
    return await getJson<RunSummary>(`/api/runtime/runs/${encodeURIComponent(executionId)}`, signal);
  } catch {
    return null;
  }
}

export async function fetchEvents(
  executionId: string,
  cursor: number,
  signal?: AbortSignal,
): Promise<EventCursorResponse> {
  return getJson<EventCursorResponse>(
    `/api/runtime/runs/${encodeURIComponent(executionId)}/events?cursor=${cursor}`,
    signal,
  );
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

export async function fetchAkg(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return getJson<Record<string, unknown>>("/api/akg", signal);
}

/** Load the checked-in YAML fixture used by the dashboard's mock traversal. */
export async function fetchAkgMock(signal?: AbortSignal): Promise<AkgMockSimulation> {
  return getJson<AkgMockSimulation>("/api/mock/akg", signal);
}
