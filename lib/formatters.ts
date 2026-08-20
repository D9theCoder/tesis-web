import {
  type AkgEdge,
  type AkgNode,
  type RunEvent,
} from "@/lib/schemas";

/** Format helpers shared by the live dashboard and results pages. */

export function fmtClock(epochSec: number | null | undefined): string {
  if (epochSec == null || !Number.isFinite(epochSec)) return "—";
  const d = new Date(epochSec * 1000);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtClockMs(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 2,
  });
}

export function fmtIso(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) return "—";
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtEpochSec(epochSec: number | null | undefined): string {
  if (epochSec == null || !Number.isFinite(epochSec)) return "—";
  return fmtIso(epochSec * 1000);
}

export function fmtIsoFromStr(value: string | null | undefined): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? fmtIso(ts) : value;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  if (m > 0) return `${m}:${pad(s)}`;
  return `${s}s`;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString([], {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function fmtPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtScore(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function normalizeRunStatus(value: string | null | undefined): string {
  const status = (value ?? "unknown").trim().toLowerCase();
  if (status === "finished" || status === "complete" || status === "completed" || status === "success") {
    return "completed";
  }
  if (status === "failed" || status === "error") return "error";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "active" || status === "running" || status === "in_progress" || status === "in-progress") {
    return "active";
  }
  if (status === "stale") return "stale";
  return status || "unknown";
}

export function fmtTokenCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function fmtCost(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(4)}`;
}

export function get(data: Record<string, unknown>, key: string): unknown {
  return data[key];
}

export function asStr(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  return v == null || typeof v === "object" ? null : String(v);
}

export function asNum(
  data: Record<string, unknown>,
  key: string,
): number | null {
  const v = data[key];
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const CONDENSED_EVENT_KEYS = [
  "output_text",
  "generated_text",
  "text",
  "content",
  "token",
  "completion",
  "message",
  "delta",
  "output",
  "response",
];

export function extractText(container: unknown): string {
  if (typeof container === "string") return container;
  if (Array.isArray(container)) {
    return container.map(extractText).filter(Boolean).join("");
  }
  if (container && typeof container === "object") {
    const obj = container as Record<string, unknown>;
    // Prefer known text-bearing keys first.
    for (const key of CONDENSED_EVENT_KEYS) {
      if (key in obj) {
        const text = extractText(obj[key]);
        if (text) return text;
      }
    }
    return "";
  }
  return "";
}

export function truncate(text: string, max = 160): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function formatEventSummary(event: RunEvent): string {
  if (event.message) return event.message;
  const data = event.data ?? {};
  const candidate = event.candidate;
  if (candidate != null && typeof candidate === "string" && candidate) {
    return `${event.event_type}: ${candidate}`;
  }
  const parts: string[] = [];
  if (event.node) parts.push(event.node);
  if (event.method) parts.push(event.method);
  return parts.length ? `${event.event_type} ${parts.join(" / ")}` : event.event_type;
}

export function upperFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

let nodeCounter = 0;
export function edgeId(source: string, target: string): string {
  nodeCounter += 1;
  return `e-${source}->${target}-${nodeCounter}`;
}

export function akgNodeLabel(node: AkgNode): string {
  return node.label ?? node.id.replace(/_/g, " ");
}

export function akgEdgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}
