import type { AkgSnapshot } from "@/lib/schemas";
import { AKG_SNAPSHOT } from "@/lib/akg-static";

export function normalizeAkgSnapshot(
  raw: Record<string, unknown>,
): AkgSnapshot {
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((node) => {
        const n = node as Record<string, unknown>;
        const type = typeof n.type === "string" ? n.type : "node";
        // Python snapshots may use generic "node" for known structural nodes.
        // Enrich presentation metadata by exact ID without adding topology.
        const known = AKG_SNAPSHOT.nodes.find((entry) => entry.id === n.id);
        return {
          id: String(n.id ?? ""),
          kind: (typeof n.kind === "string"
            ? n.kind
            : type === "node"
              ? (known?.kind ?? "node")
              : type) as AkgSnapshot["nodes"][number]["kind"],
          type,
          surface: typeof n.surface === "string" ? n.surface : undefined,
          method: typeof n.method === "string" ? n.method : undefined,
          label: String(n.label ?? String(n.id ?? "").replace(/_/g, " ")),
          payloadProfile: (n.payloadProfile ??
            n.payload_profile) as AkgSnapshot["nodes"][number]["payloadProfile"],
        };
      })
    : [];
  const edges = Array.isArray(raw.edges)
    ? raw.edges.map((edge, index) => {
        const e = edge as Record<string, unknown>;
        return {
          id: String(e.id ?? `akg-e-${index}`),
          source: String(e.source ?? ""),
          target: String(e.target ?? ""),
          isChain: Boolean(e.isChain ?? e.is_chain),
          preconditions: Array.isArray(e.preconditions)
            ? e.preconditions.map(String)
            : [],
          targetAgent:
            typeof (e.targetAgent ?? e.target_agent) === "string"
              ? String(e.targetAgent ?? e.target_agent)
              : undefined,
          priority: typeof e.priority === "number" ? e.priority : 100,
        };
      })
    : [];
  if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    return {
      schema_version: String(raw.schema_version ?? "akg.v1"),
      nodes,
      edges,
      source: typeof raw.source === "string" ? raw.source : undefined,
    };
  }
  return AKG_SNAPSHOT;
}
