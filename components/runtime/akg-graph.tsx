"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus, LocateFixed } from "lucide-react";
import type { AkgEdge, AkgNode, AkgSnapshot } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { AKG_SNAPSHOT } from "@/lib/akg-static";

type NodeState = "unknown" | "active" | "visited" | "confirmed" | "chain-enabled" | "blocked" | "current";

interface LayoutNode extends AkgNode {
  x: number;
  y: number;
  state: NodeState;
  w: number;
  h: number;
}

interface LayoutEdge extends AkgEdge {
  active: boolean;
  current: boolean;
  confirmedVia: boolean;
}

const W = 1000;
const H = 640;

// Deterministic positions (surface columns x traversal layers).
const POS: Record<string, [number, number]> = {
  unauthenticated: [500, 40],
  sqli: [180, 120],
  access_control: [500, 120],
  brute_force: [820, 120],
  sqli_union: [80, 210],
  sqli_error: [180, 210],
  sqli_boolean_blind: [280, 210],
  sqli_time_blind: [205, 290],
  ac_idor: [420, 210],
  ac_vertical_escalation: [500, 210],
  ac_force_browse: [580, 210],
  bf_dictionary: [720, 210],
  bf_spray: [820, 210],
  sqli_union_confirmed: [80, 380],
  sqli_error_confirmed: [180, 380],
  sqli_boolean_blind_confirmed: [280, 380],
  sqli_time_blind_confirmed: [205, 460],
  ac_idor_confirmed: [420, 380],
  ac_vertical_escalation_confirmed: [500, 380],
  ac_force_browse_confirmed: [580, 380],
  bf_dictionary_confirmed: [720, 380],
  bf_spray_confirmed: [820, 380],
  sqli_confirmed: [180, 470],
  access_control_confirmed: [500, 470],
  brute_force_confirmed: [820, 470],
  credentials_extracted: [720, 555],
  admin_session_obtained: [500, 555],
  data_exfiltrated: [280, 555],
  authenticated_session: [660, 300],
};

const KIND_COLOR: Record<AkgNode["kind"], string> = {
  entry: "#fcd34d",
  surface: "#67e8f9",
  method: "#8b98a3",
  confirmed: "#a3e635",
  outcome: "#f87171",
};

interface AkgGraphProps {
  snapshot?: AkgSnapshot;
  currentNode?: string | null;
  selectedMethod?: string | null;
  akgPath?: string[];
  confirmedVulns?: string[];
  achievedOutcomes?: string[];
  viableMethods?: string[];
  className?: string;
}

function computeStates(props: AkgGraphProps): Map<string, NodeState> {
  const map = new Map<string, NodeState>();
  const {
    currentNode,
    selectedMethod,
    akgPath = [],
    confirmedVulns = [],
    achievedOutcomes = [],
    viableMethods = [],
  } = props;
  const confirmed = new Set(confirmedVulns);
  const achieved = new Set(achievedOutcomes);
  const visited = new Set<string>(akgPath);

  for (const node of props.snapshot?.nodes ?? AKG_SNAPSHOT.nodes) {
    const id = node.id;
    if (currentNode && id === currentNode) {
      map.set(id, "current");
    } else if (confirmed.has(id)) {
      map.set(id, "confirmed");
    } else if (achieved.has(id)) {
      map.set(id, "chain-enabled");
    } else if (selectedMethod && id === selectedMethod) {
      map.set(id, "active");
    } else if (visited.has(id)) {
      map.set(id, "visited");
    } else if (viableMethods.includes(id)) {
      map.set(id, "active");
    } else {
      map.set(id, "unknown");
    }
  }
  return map;
}

const STATE_RING: Record<NodeState, string> = {
  current: "stroke-ember-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]",
  active: "stroke-ember-400",
  visited: "stroke-graphite-400",
  confirmed: "stroke-confirm-400",
  "chain-enabled": "stroke-signal-400",
  blocked: "stroke-danger-500",
  unknown: "stroke-graphite-600",
};

const STATE_FILL: Record<NodeState, string> = {
  current: "fill-ember-500/25",
  active: "fill-ember-500/12",
  visited: "fill-graphite-700/50",
  confirmed: "fill-confirm-500/15",
  "chain-enabled": "fill-signal-500/15",
  blocked: "fill-danger-500/15",
  unknown: "fill-graphite-800/80",
};

export function AkgGraph({
  snapshot = AKG_SNAPSHOT,
  className,
  ...props
}: AkgGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const states = useMemo(() => computeStates(props), [props]);

  const nodeById = useMemo(() => {
    const m = new Map<string, AkgNode>();
    for (const n of snapshot.nodes) m.set(n.id, n);
    return m;
  }, [snapshot]);

  const layoutNodes: LayoutNode[] = useMemo(
    () =>
      snapshot.nodes
        .map((node) => {
          const [x, y] = POS[node.id] ?? [500, 300];
          return {
            ...node,
            x,
            y,
            w: 124,
            h: 34,
            state: states.get(node.id) ?? "unknown",
          };
        }),
    [snapshot, states],
  );

  const layoutEdges: LayoutEdge[] = useMemo(() => {
    const confirmed = new Set(props.confirmedVulns ?? []);
    const achieved = new Set(props.achievedOutcomes ?? []);
    const known = new Set([...confirmed, ...achieved]);
    const pathSet = new Set(props.akgPath ?? []);
    const currentNode = props.currentNode;
    return snapshot.edges.map((e) => {
      const current =
        (pathSet.has(e.source) && pathSet.has(e.target)) ||
        e.source === currentNode ||
        e.target === currentNode;
      return {
        ...e,
        current,
        active: false,
        confirmedVia: known.has(e.source) || known.has(e.target),
      };
    });
  }, [snapshot, props]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setScale((s) => Math.min(3, Math.max(0.4, s * factor)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const s = Math.min(el.clientWidth / W, el.clientHeight / H, 1.4);
    setScale(Math.max(0.5, s));
    setOffset({
      x: (el.clientWidth - W * s) / 2,
      y: (el.clientHeight - H * s) / 2,
    });
  };

  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-graphite-700/60 px-2 py-1">
        <Legend />
        <div className="flex items-center gap-1">
          <button onClick={() => setScale((s) => Math.min(3, s * 1.2))} className="rounded-sm border border-graphite-700 p-1 text-graphite-400 hover:text-graphite-200" aria-label="Zoom in"><Plus size={12} /></button>
          <button onClick={() => setScale((s) => Math.max(0.4, s / 1.2))} className="rounded-sm border border-graphite-700 p-1 text-graphite-400 hover:text-graphite-200" aria-label="Zoom out"><Minus size={12} /></button>
          <button onClick={fit} className="flex items-center gap-1 rounded-sm border border-graphite-700 px-1.5 py-1 text-graphite-400 hover:text-graphite-200" aria-label="Fit to view">
            <LocateFixed size={12} /> Fit
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="select-none"
          onDoubleClick={fit}
        >
          {/* grid backdrop */}
          <defs>
            <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill="#1b232a" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#dotgrid)" />
          <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
            {layoutEdges.map((edge) => {
              const s = nodeById.get(edge.source);
              const t = nodeById.get(edge.target);
              if (!s || !t) return null;
              const sx = (POS[edge.source] ?? [500, 300])[0];
              const sy = (POS[edge.source] ?? [500, 300])[1];
              const tx = (POS[edge.target] ?? [500, 300])[0];
              const ty = (POS[edge.target] ?? [500, 300])[1];
              const midY = (sy + ty) / 2;
              const pathD = `M ${sx} ${sy + (sx === tx ? 0 : 0)} Q ${(sx + tx) / 2} ${midY - 20}, ${tx} ${ty}`;
              const isConfirmed = edge.confirmedVia;
              const isCurrent = edge.current;
              return (
                <g key={edge.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isCurrent ? "#f59e0b" : edge.isChain ? "#67e8f9" : isConfirmed ? "#a3e635" : "#263039"}
                    strokeWidth={isCurrent ? 2.4 : edge.isChain ? 1.6 : 1.2}
                    strokeDasharray={edge.isChain ? "5 4" : undefined}
                    opacity={isCurrent ? 1 : edge.isChain ? 0.7 : 0.5}
                  />
                  {edge.isChain && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#67e8f9"
                      strokeWidth={1.2}
                      strokeDasharray="5 4"
                      opacity={edge.confirmedVia ? 0.9 : 0.2}
                    />
                  )}
                </g>
              );
            })}
            {layoutNodes.map((node) => {
              const x = node.x - node.w / 2;
              const y = node.y - node.h / 2;
              const isCurrent = node.state === "current";
              return (
                <g key={node.id} transform={`translate(${x},${y})`} className="cursor-pointer">
                  <rect
                    width={node.w}
                    height={node.h}
                    rx={4}
                    className={cn(STATE_FILL[node.state], STATE_RING[node.state], "stroke-[1.4]")}
                  />
                  <text
                    x={node.w / 2}
                    y={node.h / 2 + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                    fill={isCurrent ? "#fcd34d" : node.state === "confirmed" ? "#a3e635" : KIND_COLOR[node.kind]}
                    className={isCurrent ? "animate-pulse" : ""}
                  >
                    {node.label ?? node.id.replace(/_/g, " ")}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<[NodeState, string]> = [
    ["current", "current"],
    ["active", "active"],
    ["visited", "visited"],
    ["confirmed", "confirmed"],
    ["chain-enabled", "chain"],
    ["blocked", "blocked"],
    ["unknown", "unknown"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-label">Legend</span>
      {items.map(([state, label]) => (
        <span key={state} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-sm border", STATE_FILL[state], STATE_RING[state])} />
          <span className="font-mono text-[9px] uppercase text-graphite-400">{label}</span>
        </span>
      ))}
    </div>
  );
}

export function NodeRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
