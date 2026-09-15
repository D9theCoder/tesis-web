import ELK, { type ElkNode, type ElkPoint } from "elkjs/lib/elk.bundled.js";
import type { AkgSnapshot, AkgNode, AkgEdge } from "./schemas";

export const LAYOUT_SETTINGS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "24",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.spacing.edgeNode": "20",
  "elk.padding": "[top=40,left=24,bottom=24,right=24]",
  "elk.randomSeed": "1",
};
export const NODE_WIDTH = 152;
export const NODE_HEIGHT = 56;
export type PlacedNode = {
  node: AkgNode;
  x: number;
  y: number;
  width: number;
  height: number;
  surface?: string;
  ports: { id: string; x: number; y: number; source: boolean }[];
};
export type PlacedEdge = {
  edge: AkgEdge;
  points: ElkPoint[][];
  sourcePort: string;
  targetPort: string;
};
export type AkgLayout = {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  groups: {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
};

/** Shared entries/outcomes never join a presentation group. Infer only when all
 * reachable non-chain relationships agree on one surface. */
export function surfaceGroups(snapshot: AkgSnapshot): Map<string, string> {
  const eligible = new Map(
    snapshot.nodes
      .filter((n) => !["entry", "outcome"].includes(n.kind))
      .map((n) => [n.id, n]),
  );
  const result = new Map<string, string>();
  const visited = new Set<string>();
  for (const node of eligible.values()) {
    if (visited.has(node.id)) continue;
    const component = new Set<string>();
    const pending = [node.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      visited.add(id);
      for (const edge of snapshot.edges) {
        if (edge.isChain) continue;
        const neighbor =
          edge.source === id
            ? edge.target
            : edge.target === id
              ? edge.source
              : null;
        if (neighbor && eligible.has(neighbor) && !component.has(neighbor))
          pending.push(neighbor);
      }
    }
    const surfaces = new Set(
      [...component].flatMap((id) => {
        const n = eligible.get(id)!;
        return n.surface ? [n.surface] : n.kind === "surface" ? [n.id] : [];
      }),
    );
    for (const id of component) {
      const explicit = eligible.get(id)!.surface;
      if (explicit || surfaces.size === 1)
        result.set(id, explicit ?? [...surfaces][0]);
    }
  }
  return result;
}

const cache = new Map<string, Promise<AkgLayout>>();
export function snapshotLayoutKey(snapshot: AkgSnapshot): string {
  return JSON.stringify([snapshot, LAYOUT_SETTINGS, NODE_WIDTH, NODE_HEIGHT]);
}
export function layoutAkg(snapshot: AkgSnapshot): Promise<AkgLayout> {
  const key = snapshotLayoutKey(snapshot);
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = computeLayout(snapshot).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return promise;
}

async function computeLayout(snapshot: AkgSnapshot): Promise<AkgLayout> {
  if (!snapshot.nodes.length)
    throw new Error("The AKG snapshot contains no nodes");
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  if (ids.size !== snapshot.nodes.length)
    throw new Error("Duplicate AKG node IDs");
  if (
    new Set(snapshot.edges.map((edge) => edge.id)).size !==
    snapshot.edges.length
  )
    throw new Error("Duplicate AKG edge IDs");
  for (const edge of snapshot.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target))
      throw new Error(`Missing endpoint: ${edge.source} → ${edge.target}`);
  }
  const groups = surfaceGroups(snapshot);
  const groupIds = new Map(
    [...new Set(groups.values())]
      .sort()
      .map((surface, i) => [surface, `__surface_group_${i}`]),
  );
  // Layout IDs live in a separate namespace so unfamiliar snapshot IDs remain safe.
  const layoutIds = new Map(
    snapshot.nodes.map((node, i) => [node.id, `node-${i}`]),
  );
  const children: ElkNode[] = [];
  const containers = new Map<string, ElkNode>();
  for (const [surface, id] of groupIds) {
    const container: ElkNode = {
      id,
      layoutOptions: { ...LAYOUT_SETTINGS, "elk.partitioning.partition": "1" },
      children: [],
    };
    containers.set(surface, container);
    children.push(container);
  }
  snapshot.nodes.forEach((node) => {
    const ports = snapshot.edges.flatMap((edge, i) => [
      ...(edge.source === node.id
        ? [
            {
              id: `port-${i}-source`,
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "EAST" },
            },
          ]
        : []),
      ...(edge.target === node.id
        ? [
            {
              id: `port-${i}-target`,
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": "WEST" },
            },
          ]
        : []),
    ]);
    const child: ElkNode = {
      id: layoutIds.get(node.id)!,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ports,
      layoutOptions: {
        "elk.portConstraints": "FIXED_ORDER",
        "elk.partitioning.partition":
          node.kind === "entry" ? "0" : node.kind === "outcome" ? "2" : "1",
      },
    };
    const surface = groups.get(node.id);
    if (surface) containers.get(surface)!.children!.push(child);
    else children.push(child);
  });
  const graph: ElkNode = {
    id: "root",
    layoutOptions: { ...LAYOUT_SETTINGS, "elk.partitioning.activate": "true" },
    children,
    edges: snapshot.edges.map((_, i) => ({
      id: `edge-${i}`,
      sources: [`port-${i}-source`],
      targets: [`port-${i}-target`],
    })),
  };
  const resolved = await new ELK().layout(graph);
  const result: AkgLayout = { nodes: [], edges: [], groups: [] };
  const nodeByLayoutId = new Map(
    snapshot.nodes.map((node) => [layoutIds.get(node.id), node]),
  );
  const offsets = new Map<string, { x: number; y: number }>([
    ["root", { x: 0, y: 0 }],
  ]);
  function collectOffsets(parent: ElkNode, x: number, y: number) {
    for (const child of parent.children ?? []) {
      const offset = { x: x + (child.x ?? 0), y: y + (child.y ?? 0) };
      offsets.set(child.id, offset);
      collectOffsets(child, offset.x, offset.y);
    }
  }
  collectOffsets(resolved, 0, 0);
  function visit(parent: ElkNode, x: number, y: number) {
    for (const child of parent.children ?? []) {
      const cx = x + (child.x ?? 0),
        cy = y + (child.y ?? 0);
      const node = nodeByLayoutId.get(child.id);
      if (node)
        result.nodes.push({
          node,
          x: cx,
          y: cy,
          width: child.width!,
          height: child.height!,
          surface: groups.get(node.id),
          ports: (child.ports ?? []).map((port) => ({
            id: port.id,
            x: port.x ?? 0,
            y: port.y ?? 0,
            source: port.id.endsWith("source"),
          })),
        });
      else
        result.groups.push({
          id: child.id,
          label: [...groupIds].find(([, id]) => id === child.id)![0],
          x: cx,
          y: cy,
          width: child.width!,
          height: child.height!,
        });
      visit(child, cx, cy);
    }
    for (const edge of parent.edges ?? []) {
      const index = Number(edge.id.replace("edge-", ""));
      const sections = edge.sections ?? [];
      const origin = offsets.get(edge.container ?? parent.id)!;
      if (!sections.length)
        throw new Error(`No route for ${snapshot.edges[index].id}`);
      result.edges.push({
        edge: snapshot.edges[index],
        sourcePort: `port-${index}-source`,
        targetPort: `port-${index}-target`,
        points: sections.map((section) =>
          [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ].map((p) => ({
            x: Math.round((p.x + origin.x) * 1e6) / 1e6,
            y: Math.round((p.y + origin.y) * 1e6) / 1e6,
          })),
        ),
      });
    }
  }
  visit(resolved, 0, 0);
  return result;
}

export const directedPair = (source: string, target: string) =>
  JSON.stringify([source, target]);
export function traversedPairs(path: string[]): Set<string> {
  return new Set(
    path.slice(1).map((target, i) => directedPair(path[i], target)),
  );
}
export function focusNodeIds(
  snapshot: AkgSnapshot,
  path: string[],
  current: string | null,
  selected: string | null,
): Set<string> {
  const core = new Set([
    ...path,
    ...(current ? [current] : []),
    ...(selected ? [selected] : []),
  ]);
  const visible = new Set(core);
  for (const edge of snapshot.edges) {
    if (core.has(edge.source)) visible.add(edge.target);
    if (core.has(edge.target)) visible.add(edge.source);
  }
  return visible;
}

export function shortNodeLabel(node: AkgNode): string {
  const label = node.label ?? node.id.replace(/_/g, " ");
  const readable = label
    .replace(/ confirmed$/i, "")
    .replace(/^(sqli|ac|bf)[ _]/i, "");
  const known: Record<string, string> = {
    sqli: "SQL injection",
    ac: "Access control",
    bf: "Brute force",
    idor: "IDOR",
  };
  return (
    known[readable.toLowerCase()] ??
    readable.replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Round each routed bend without changing any directed endpoints. */
export function roundedRoute(points: ElkPoint[]): string {
  if (!points.length) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y),
      after = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(8, before / 2, after / 2);
    if (!r) continue;
    path += ` L ${b.x + ((a.x - b.x) * r) / before} ${b.y + ((a.y - b.y) * r) / before} Q ${b.x} ${b.y} ${b.x + ((c.x - b.x) * r) / after} ${b.y + ((c.y - b.y) * r) / after}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}
