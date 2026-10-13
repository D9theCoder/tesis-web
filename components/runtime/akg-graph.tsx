"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import {
  BookOpen,
  Check,
  Crosshair,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AkgSnapshot } from "@/lib/schemas";
import {
  layoutAkg,
  snapshotLayoutKey,
  shortNodeLabel,
  roundedRoute,
  traversedPairs,
  directedPair,
  focusNodeIds,
  type AkgLayout,
  type PlacedNode,
  type PlacedEdge,
} from "@/lib/akg-layout";

type Props = {
  snapshot: AkgSnapshot;
  currentNode: string | null;
  selectedMethod: string | null;
  akgPath: string[];
  confirmedVulns: string[];
  achievedOutcomes: string[];
  viableMethods: string[];
  onLayoutReady?: () => void;
};
type CardNode = Node<
  {
    placed: PlacedNode;
    current: boolean;
    achieved: boolean;
    visited: boolean;
    chosen: boolean;
  },
  "card"
>;
type RouteEdge = Edge<
  { placed: PlacedEdge; traversed: boolean; latest: boolean },
  "route"
>;

function NodeCard({ data }: NodeProps<CardNode>) {
  const { placed, current, achieved, visited, chosen } = data;
  const node = placed.node;
  const badge = achieved
    ? node.kind === "outcome"
      ? "✓ Achieved"
      : "✓ Confirmed"
    : node.kind === "confirmed"
      ? "◇ Confirmation"
      : node.kind;
  return (
    <div
      className={`akg-node ${current ? "is-current" : ""} ${achieved ? "is-achieved" : ""} ${chosen ? "is-selected" : ""}`}
      title={`${node.label ?? node.id}\n${node.id}`}
      data-node-id={node.id}
      data-current={current}
      data-achieved={achieved}
    >
      {placed.ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.source ? "source" : "target"}
          position={port.source ? Position.Right : Position.Left}
          isConnectable={false}
          style={{
            left: port.x,
            top: port.y,
            right: "auto",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
      <span className="akg-node-label">{shortNodeLabel(node)}</span>
      <span className="akg-node-kind">
        {badge}
        {current ? " · Current" : visited ? " · Visited" : ""}
      </span>
    </div>
  );
}
function RoutedEdge({ id, data, markerEnd }: EdgeProps<RouteEdge>) {
  if (!data) return null;
  return (
    <g
      data-edge-id={data.placed.edge.id}
      data-traversed={data.traversed}
      data-latest={data.latest}
    >
      {data.placed.points.map((points, index) => (
        <BaseEdge
          key={index}
          id={`${id}-${index}`}
          path={roundedRoute(points)}
          markerEnd={
            index === data.placed.points.length - 1 ? markerEnd : undefined
          }
          interactionWidth={16}
          style={{
            stroke: data.latest
              ? "var(--akg-current)"
              : data.traversed
                ? "var(--akg-traversed)"
                : "var(--akg-edge)",
            strokeWidth: data.traversed ? 2.5 : 1,
            strokeDasharray: data.placed.edge.isChain ? "7 5" : undefined,
          }}
        />
      ))}
    </g>
  );
}
function SurfaceGroup({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div className="akg-surface-label">{data.label.replace(/_/g, " ")}</div>
  );
}
const nodeTypes = { card: NodeCard, surfaceGroup: SurfaceGroup };
const edgeTypes = { route: RoutedEdge };

export function AkgGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas(props: Props) {
  const {
    snapshot,
    akgPath,
    currentNode,
    confirmedVulns,
    achievedOutcomes,
    onLayoutReady,
  } = props;
  const [layout, setLayout] = useState<AkgLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"full" | "focus">("full");
  const [selected, setSelected] = useState<{
    kind: "node" | "edge";
    id: string;
  } | null>(null);
  const [legend, setLegend] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const root = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const selectionOrigin = useRef<HTMLElement | null>(null);
  const savedViewport = useRef<Viewport | null>(null);
  const flow = useReactFlow();
  const initialized = useNodesInitialized();
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Controlled React Flow nodes must retain browser measurements. Keeping
    // these separate from placement lets runtime updates preserve both.
    const dimensions = changes.filter(
      (change) => change.type === "dimensions" && change.dimensions,
    );
    if (!dimensions.length) return;
    setMeasurements((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const change of dimensions) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        if (
          next[change.id]?.width !== change.dimensions.width ||
          next[change.id]?.height !== change.dimensions.height
        ) {
          next[change.id] = change.dimensions;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, []);
  const key = snapshotLayoutKey(snapshot);
  const readyCallback = useRef(onLayoutReady);
  useEffect(() => {
    readyCallback.current = onLayoutReady;
  }, [onLayoutReady]);
  useEffect(() => {
    let stopped = false;
    // Reset the pending external layout request before subscribing to its result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(null);
    setLayoutError(null);
    void layoutAkg(snapshot)
      .then((result) => {
        if (!stopped) setLayout(result);
      })
      .catch((error) => {
        if (!stopped)
          setLayoutError(
            error instanceof Error ? error.message : "Graph layout failed",
          );
      });
    return () => {
      stopped = true;
    };
    // Content, rather than object identity, controls cached placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  const fit = useCallback(() => {
    return flow.fitView({
      padding: 0.12,
      duration: 0,
      minZoom: 0.08,
      maxZoom: 1,
    });
  }, [flow]);
  useEffect(() => {
    if (!layout || !initialized) return;
    let stopped = false;
    const frame = requestAnimationFrame(async () => {
      await fit();
      if (!stopped) readyCallback.current?.();
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [layout, initialized, view, fit]);

  const latest =
    akgPath.length > 1
      ? directedPair(akgPath[akgPath.length - 2], akgPath[akgPath.length - 1])
      : null;

  const pairs = useMemo(() => traversedPairs(akgPath), [akgPath]);
  const visible = useMemo(
    () =>
      view === "full"
        ? new Set(snapshot.nodes.map((node) => node.id))
        : focusNodeIds(
            snapshot,
            akgPath,
            currentNode,
            selected?.kind === "node" ? selected.id : null,
          ),
    [view, snapshot, akgPath, currentNode, selected],
  );
  const nodes: Node[] = useMemo(
    () =>
      !layout
        ? []
        : [
            ...layout.groups.map((group) => ({
              id: `presentation:${group.id}`,
              type: "surfaceGroup",
              position: { x: group.x, y: group.y },
              data: { label: group.label },
              style: { width: group.width, height: group.height },
              className: "akg-surface-group",
              selectable: false,
              focusable: false,
              zIndex: -1,
              hidden: !layout.nodes.some(
                (node) =>
                  node.surface === group.label && visible.has(node.node.id),
              ),
            })),
            ...layout.nodes.map(
              (placed): CardNode => ({
                id: placed.node.id,
                type: "card",
                position: { x: placed.x, y: placed.y },
                style: { width: placed.width, height: placed.height },
                data: {
                  placed,
                  current: currentNode === placed.node.id,
                  achieved:
                    confirmedVulns.includes(placed.node.id) ||
                    achievedOutcomes.includes(placed.node.id),
                  visited: akgPath.includes(placed.node.id),
                  chosen:
                    selected?.kind === "node" && selected.id === placed.node.id,
                },
                hidden: !visible.has(placed.node.id),
                ariaLabel: `${placed.node.label ?? placed.node.id}, ${placed.node.kind}. Inspect node`,
              }),
            ),
          ].map((node) => ({ ...node, measured: measurements[node.id] })),
    [
      layout,
      visible,
      currentNode,
      confirmedVulns,
      achievedOutcomes,
      akgPath,
      selected,
      measurements,
    ],
  );
  const edges: RouteEdge[] = useMemo(
    () =>
      !layout
        ? []
        : layout.edges.map((placed) => {
            const pair = directedPair(placed.edge.source, placed.edge.target);
            const traversed = pairs.has(pair),
              isLatest = pair === latest;
            return {
              id: placed.edge.id,
              source: placed.edge.source,
              target: placed.edge.target,
              sourceHandle: placed.sourcePort,
              targetHandle: placed.targetPort,
              type: "route",
              data: {
                placed,
                traversed,
                latest: isLatest,
              },
              hidden:
                !visible.has(placed.edge.source) ||
                !visible.has(placed.edge.target),
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isLatest
                  ? "var(--akg-current)"
                  : traversed
                    ? "var(--akg-traversed)"
                    : "var(--akg-edge)",
                width: 16,
                height: 16,
              },
              ariaLabel: `${placed.edge.source} to ${placed.edge.target}. Inspect transition`,
            };
          }),
    [layout, pairs, latest, visible],
  );

  const center = (id: string) => {
    const node = layout?.nodes.find((placed) => placed.node.id === id);
    if (node)
      void flow.setCenter(node.x + node.width / 2, node.y + node.height / 2, {
        zoom: Math.max(flow.getZoom(), 0.9),
        duration: 0,
      });
  };
  const closeExpanded = useCallback(() => {
    setExpanded(false);
    requestAnimationFrame(() => {
      if (savedViewport.current) void flow.setViewport(savedViewport.current);
      expandButton.current?.focus();
    });
  }, [flow]);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const others = [
      ...document.querySelectorAll<HTMLElement>(
        "body > header, .runtime-toolbar, .mock-summary, .runtime-sidebar",
      ),
    ];
    const oldInert = others.map((element) => element.inert);
    others.forEach((element) => {
      element.inert = true;
    });
    root.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExpanded();
      }
      if (event.key === "Tab") {
        const targets = [
          ...root.current!.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex="0"]',
          ),
        ].filter((element) => element.getClientRects().length);
        const first = targets[0],
          last = targets.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      others.forEach((element, i) => {
        element.inert = oldInert[i];
      });
      document.removeEventListener("keydown", keydown);
    };
  }, [expanded, closeExpanded]);
  useEffect(() => {
    if (selected) drawerClose.current?.focus();
  }, [selected]);

  const inspectedNode =
    selected?.kind === "node"
      ? layout?.nodes.find((node) => node.node.id === selected.id)
      : undefined;
  const inspectedEdge =
    selected?.kind === "edge"
      ? snapshot.edges.find((edge) => edge.id === selected.id)
      : undefined;
  const inspect = (kind: "node" | "edge", id: string) => {
    selectionOrigin.current = document.activeElement as HTMLElement;
    setSelected({ kind, id });
  };
  return (
    <div
      ref={root}
      data-layout-ready={initialized}
      className={`akg-view ${expanded ? "akg-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label="Attack knowledge graph"
      tabIndex={expanded ? -1 : undefined}
    >
      <header className="akg-heading">
        <div className="akg-heading-copy">
          <h2>Attack knowledge graph</h2>
          <p>Traversal map for the current run</p>
        </div>
        <span className="akg-count" data-testid="node-count">
          {snapshot.nodes.filter((node) => visible.has(node.id)).length}/
          {snapshot.nodes.length} nodes
        </span>
      </header>
      <div className="akg-toolbar" role="group" aria-label="Graph controls">
        <div className="akg-control-group" role="group" aria-label="Graph view">
          <span className="akg-control-label">View</span>
          <div className="akg-view-switch">
          <button
            type="button"
            aria-pressed={view === "full"}
            onClick={() => setView("full")}
          >
            Full graph
          </button>
          <button
            type="button"
            aria-pressed={view === "focus"}
            onClick={() => setView("focus")}
          >
            Focus path
          </button>
          </div>
        </div>
        <div className="akg-control-group" role="group" aria-label="Graph position">
          <span className="akg-control-label">Position</span>
          <button type="button" onClick={fit} title="Fit all visible nodes in the graph">
            <Crosshair aria-hidden="true" size={15} /> Fit
          </button>
          <button
            type="button"
            onClick={() => currentNode && center(currentNode)}
            disabled={!currentNode}
            title={currentNode ? `Center ${currentNode}` : "No current node is available"}
          >
            <Crosshair aria-hidden="true" size={15} /> Center current
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="ui-button-icon"
            title="Zoom out"
            onClick={() => void flow.zoomOut()}
          >
            <ZoomOut aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="ui-button-icon"
            title="Zoom in"
            onClick={() => void flow.zoomIn()}
          >
            <ZoomIn aria-hidden="true" size={15} />
          </button>
        </div>
        <div className="akg-control-group" role="group" aria-label="Graph display">
          <span className="akg-control-label">Display</span>
          <button
            type="button"
            ref={expandButton}
            onClick={() => {
              if (expanded) closeExpanded();
              else {
                savedViewport.current = flow.getViewport();
                setExpanded(true);
              }
            }}
            title={expanded ? "Close expanded graph" : "Expand graph"}
          >
            {expanded ? (
              <Minimize2 aria-hidden="true" size={15} />
            ) : (
              <Maximize2 aria-hidden="true" size={15} />
            )}
            {expanded ? "Close expanded view" : "Expand"}
          </button>
          <button
            type="button"
            aria-expanded={legend}
            aria-controls={legend ? "akg-legend" : undefined}
            onClick={() => setLegend((value) => !value)}
            title={legend ? "Hide graph legend" : "Show graph legend"}
          >
            <BookOpen aria-hidden="true" size={15} /> Legend
          </button>
        </div>
      </div>
      {legend && (
        <div className="akg-legend" id="akg-legend" aria-label="Graph legend">
          <span className="akg-legend-item">
            <span className="akg-legend-marker legend-current" aria-hidden="true" />
            <span>Current node or latest transition</span>
          </span>
          <span className="akg-legend-item">
            <span className="akg-legend-marker legend-traversed" aria-hidden="true" />
            <span>Traversed route</span>
          </span>
          <span className="akg-legend-item">
            <Check aria-hidden="true" size={14} className="legend-achieved" />
            <span>Confirmed or achieved</span>
          </span>
          <span className="akg-legend-item">
            <span className="akg-legend-marker legend-pending" aria-hidden="true" />
            <span>Pending node</span>
          </span>
          <span className="akg-legend-item">
            <span className="akg-legend-marker legend-chain" aria-hidden="true" />
            <span>Chain transition</span>
          </span>
          <span className="akg-legend-item">
            <X aria-hidden="true" size={14} className="legend-failed" />
            <span>Mismatch</span>
          </span>
        </div>
      )}
      <div className="akg-canvas">
        {layoutError ? (
          <div className="akg-layout-message" role="alert">
            Layout failed: {layoutError}
            <button onClick={() => setRetry((value) => value + 1)}>
              Retry layout
            </button>
          </div>
        ) : !layout ? (
          <div className="akg-layout-message" role="status">
            Arranging graph…
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            minZoom={0.08}
            maxZoom={2.5}
            onNodeClick={(_, node) => inspect("node", node.id)}
            onEdgeClick={(_, edge) => inspect("edge", edge.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              const element = (event.target as HTMLElement).closest(
                ".react-flow__node, .react-flow__edge",
              );
              const id = element?.getAttribute("data-id");
              if (id) {
                event.preventDefault();
                inspect(
                  element!.classList.contains("react-flow__node")
                    ? "node"
                    : "edge",
                  id,
                );
              }
            }}
            colorMode="light"
          />
        )}
        {selected && (
          <aside className="akg-details" aria-label="Graph inspection">
            <button
              ref={drawerClose}
              type="button"
              className="akg-details-close ui-button-icon"
              aria-label="Close inspection"
              onClick={() => {
                setSelected(null);
                selectionOrigin.current?.focus();
              }}
            >
              <X aria-hidden="true" size={17} />
            </button>
            {inspectedNode && (
              <>
                <h3 title={inspectedNode.node.label ?? inspectedNode.node.id}>
                  {inspectedNode.node.label ?? inspectedNode.node.id}
                </h3>
                <dl className="metadata-list akg-inspection-fields">
                  <div className="metadata-field">
                    <dt>ID</dt>
                    <dd title={inspectedNode.node.id}>{inspectedNode.node.id}</dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Kind</dt>
                    <dd>{inspectedNode.node.kind}</dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Surface</dt>
                    <dd>
                      {inspectedNode.surface ??
                        inspectedNode.node.surface ??
                        "Shared"}
                    </dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Runtime state</dt>
                    <dd>
                      {currentNode === inspectedNode.node.id ? "Current · " : ""}
                      {confirmedVulns.includes(inspectedNode.node.id)
                        ? "Confirmed"
                        : achievedOutcomes.includes(inspectedNode.node.id)
                          ? "Achieved"
                          : akgPath.includes(inspectedNode.node.id)
                            ? "Visited"
                            : "Pending"}
                    </dd>
                  </div>
                </dl>
              </>
            )}
            {inspectedEdge && (
              <>
                <h3>{inspectedEdge.isChain ? "Chain transition" : "Transition"}</h3>
                <dl className="metadata-list akg-inspection-fields">
                  <div className="metadata-field">
                    <dt>Source</dt>
                    <dd title={inspectedEdge.source}>{inspectedEdge.source}</dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Target</dt>
                    <dd title={inspectedEdge.target}>{inspectedEdge.target}</dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Preconditions</dt>
                    <dd>{inspectedEdge.preconditions.join(", ") || "None"}</dd>
                  </div>
                  <div className="metadata-field">
                    <dt>Target agent</dt>
                    <dd>{inspectedEdge.targetAgent ?? "None"}</dd>
                  </div>
                </dl>
              </>
            )}
            {!inspectedNode && !inspectedEdge && (
              <p className="empty-state">Details for this graph item are unavailable.</p>
            )}
          </aside>
        )}
      </div>
      <nav className="akg-traversal" aria-label="Numbered traversal">
        <span className="akg-traversal-label">Runtime path</span>
        {akgPath.length ? (
          akgPath.map((id, index) => (
            <button
              key={`${index}-${id}`}
              title={id}
              onClick={() => center(id)}
              aria-label={`Step ${index + 1}: ${id}`}
            >
              <b>{index + 1}</b>
              {shortNodeLabel(
                snapshot.nodes.find((node) => node.id === id) ?? {
                  id,
                  type: "node",
                  kind: "method",
                },
              )}
            </button>
          ))
        ) : (
          <span className="akg-empty-path">Waiting for traversal</span>
        )}
      </nav>
    </div>
  );
}
