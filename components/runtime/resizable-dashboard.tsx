"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_HEIGHT_KEY,
  DASHBOARD_MAX_HEIGHT,
  DASHBOARD_MIN_HEIGHT,
  PANEL_MIN_HEIGHT,
  RAIL_DEFAULT_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_STORAGE_KEY,
  PANEL_STORAGE_KEY,
  SPLITTER_SIZE,
  applyPanelDelta,
  clampDashboardHeight,
  clampRailWidth,
  defaultPanelHeights,
  effectivePanelMin,
  fitPanelHeights,
  keyboardStep,
  panelMaxHeight,
  parseDashboardHeight,
  parsePanelHeights,
  parseRailWidth,
  railMaxWidth,
  readStoredValue,
  resetPanelPair,
  serializeDashboardHeight,
  serializePanelHeights,
  serializeRailWidth,
  setPanelHeight,
  writeStoredValue,
} from "@/lib/resizable-layout";
import styles from "./resizable-dashboard.module.css";

export type RuntimePanelDescriptor = {
  label: string;
  content: ReactNode;
};

type ResizableRuntimeDashboardProps = {
  graph: ReactNode;
  panels: readonly [
    RuntimePanelDescriptor,
    RuntimePanelDescriptor,
    RuntimePanelDescriptor,
  ];
};

const WIDE_MEDIA_QUERY = "(min-width: 1201px)";
const FALLBACK_RAIL_HEIGHT = 700;
const DASHBOARD_ID = "runtime-dashboard";
const SIDEBAR_ID = "runtime-sidebar";
const RAIL_HANDLE_ID = "runtime-rail-resizer";
const HEIGHT_HANDLE_ID = "runtime-height-resizer";
const PANEL_IDS = [
  "runtime-coordinate-panel",
  "runtime-conversation-panel",
  "runtime-outcomes-panel",
] as const;

type RailDrag = {
  kind: "rail";
  pointerId: number;
  startX: number;
  startWidth: number;
};

type PanelDrag = {
  kind: "panel";
  index: number;
  pointerId: number;
  startY: number;
  startHeights: number[];
};

type HeightDrag = {
  kind: "height";
  pointerId: number;
  startY: number;
  startHeight: number;
};

type DragSession = RailDrag | PanelDrag | HeightDrag;

type BodyLock = {
  cursor: string;
  userSelect: string;
};

/* useLayoutEffect warns during SSR; effects still restore after hydration. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function panelId(index: number): string {
  return PANEL_IDS[index] ?? `runtime-panel-${index}`;
}

function panelResizeLabel(label: string): string {
  return `Resize runtime ${label.toLowerCase()} panel`;
}

function subscribeWide(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(WIDE_MEDIA_QUERY);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function wideSnapshot(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(WIDE_MEDIA_QUERY).matches
  );
}

function wideServerSnapshot(): boolean {
  return false;
}

/**
 * The live monitor workspace. Narrow viewports render the existing
 * two-column/stacked dashboard untouched; wide viewports add one vertical
 * rail splitter and a horizontal splitter between each pair of side panels.
 */
export function ResizableRuntimeDashboard({
  graph,
  panels,
}: ResizableRuntimeDashboardProps) {
  const wide = useSyncExternalStore(
    subscribeWide,
    wideSnapshot,
    wideServerSnapshot,
  );
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT_WIDTH);
  const [panelHeights, setPanelHeights] = useState<number[]>(() =>
    defaultPanelHeights(FALLBACK_RAIL_HEIGHT),
  );
  const [containerHeight, setContainerHeight] = useState(FALLBACK_RAIL_HEIGHT);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [activeHandle, setActiveHandle] = useState<
    "rail" | "height" | number | null
  >(null);

  const asideRef = useRef<HTMLElement | null>(null);
  const containerHeightRef = useRef(FALLBACK_RAIL_HEIGHT);
  const customHeightRef = useRef(false);
  const defaultHeightRef = useRef(FALLBACK_RAIL_HEIGHT);
  const panelCustomizedRef = useRef(false);
  const dragRef = useRef<DragSession | null>(null);
  const bodyLockRef = useRef<BodyLock | null>(null);

  const lockBody = useCallback((cursor: string) => {
    if (typeof document === "undefined" || bodyLockRef.current) return;
    bodyLockRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
  }, []);

  const unlockBody = useCallback(() => {
    const original = bodyLockRef.current;
    if (!original || typeof document === "undefined") return;
    document.body.style.cursor = original.cursor;
    document.body.style.userSelect = original.userSelect;
    bodyLockRef.current = null;
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setActiveHandle(null);
    unlockBody();
  }, [unlockBody]);

  useEffect(() => () => unlockBody(), [unlockBody]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_MEDIA_QUERY);
    const onLeaveWide = (event: MediaQueryListEvent) => {
      // The handle that owns pointer capture unmounts below the breakpoint.
      if (!event.matches) endDrag();
    };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onLeaveWide);
      return () => query.removeEventListener("change", onLeaveWide);
    }
    query.addListener(onLeaveWide);
    return () => query.removeListener(onLeaveWide);
  }, [endDrag]);

  const applyContainerHeight = useCallback((height: number) => {
    if (!Number.isFinite(height) || height < 1) return;
    const nextHeight = Math.floor(height);
    containerHeightRef.current = nextHeight;
    setContainerHeight(nextHeight);
    setPanelHeights((previous) => {
      const next = panelCustomizedRef.current
        ? fitPanelHeights(previous, nextHeight)
        : defaultPanelHeights(nextHeight);
      return next.every((value, index) => value === previous[index])
        ? previous
        : next;
    });
  }, []);

  /**
   * The dashboard-height handle owns the boundary against the content below.
   * Once the user moves it, the inline height replaces the CSS `--live-height`
   * clamp and both the graph and the stacked rail grow with it.
   */
  const commitHeight = useCallback(
    (height: number) => {
      const next = clampDashboardHeight(height);
      customHeightRef.current = true;
      setCustomHeight(next);
      applyContainerHeight(next);
    },
    [applyContainerHeight],
  );

  const resetHeight = useCallback(() => {
    customHeightRef.current = false;
    setCustomHeight(null);
    // Return to the CSS-clamped height right away; the resize observer keeps
    // it in sync once the browser re-lays out the dashboard.
    applyContainerHeight(defaultHeightRef.current);
    writeStoredValue(DASHBOARD_HEIGHT_KEY, "");
  }, [applyContainerHeight]);

  // Restore persistence only after hydration; the server always renders the
  // narrow (handle-free) layout with default sizes.
  useIsomorphicLayoutEffect(() => {
    const storedRail = parseRailWidth(readStoredValue(RAIL_STORAGE_KEY));
    if (storedRail !== null) {
      setRailWidth(clampRailWidth(storedRail, window.innerWidth));
    }
    const storedHeight = parseDashboardHeight(
      readStoredValue(DASHBOARD_HEIGHT_KEY),
    );
    const initialHeight = storedHeight ?? containerHeightRef.current;
    if (storedHeight !== null) {
      customHeightRef.current = true;
      containerHeightRef.current = storedHeight;
      setContainerHeight(storedHeight);
      setCustomHeight(storedHeight);
    }
    const storedPanels = parsePanelHeights(readStoredValue(PANEL_STORAGE_KEY));
    if (storedPanels !== null) {
      panelCustomizedRef.current = true;
      setPanelHeights(fitPanelHeights(storedPanels, initialHeight));
    } else if (storedHeight !== null) {
      setPanelHeights(defaultPanelHeights(storedHeight));
    }
    setRestored(true);
  }, []);

  // Measure the real aside height: the global `--live-height` clamp stays in
  // charge of the outer size, while these pixel rows fill it exactly.
  useIsomorphicLayoutEffect(() => {
    if (!wide) return;
    const aside = asideRef.current;
    if (!aside) return;

    const measure = () => {
      // A user-set height replaces the CSS clamp; do not let the observer
      // overwrite it with the aside's previous layout height.
      if (!customHeightRef.current) {
        const height =
          aside.getBoundingClientRect().height || aside.clientHeight || 0;
        if (height > 0) defaultHeightRef.current = height;
        applyContainerHeight(height);
      }
      setRailWidth((current) => clampRailWidth(current, window.innerWidth));
    };
    measure();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => measure());
      observer.observe(aside);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide, applyContainerHeight]);

  useEffect(() => {
    if (!wide || !restored || activeHandle !== null) return;
    writeStoredValue(RAIL_STORAGE_KEY, serializeRailWidth(railWidth));
  }, [wide, railWidth, restored, activeHandle]);

  useEffect(() => {
    if (!wide || !restored || activeHandle !== null) return;
    writeStoredValue(PANEL_STORAGE_KEY, serializePanelHeights(panelHeights));
  }, [wide, panelHeights, restored, activeHandle]);

  useEffect(() => {
    if (!wide || !restored || activeHandle !== null || customHeight === null) {
      return;
    }
    writeStoredValue(
      DASHBOARD_HEIGHT_KEY,
      serializeDashboardHeight(customHeight),
    );
  }, [wide, customHeight, restored, activeHandle]);

  const beginPointerDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    createSession: (pointerId: number) => DragSession,
    cursor: string,
  ) => {
    if (event.button !== 0) return;
    if (dragRef.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const session = createSession(event.pointerId);
    dragRef.current = session;
    setActiveHandle(
      session.kind === "panel"
        ? session.index
        : session.kind === "height"
          ? "height"
          : "rail",
    );
    lockBody(cursor);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is unsupported (or synthetic in tests). */
    }
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    endDrag();
  };

  const resetRail = useCallback(() => {
    setRailWidth(RAIL_DEFAULT_WIDTH);
  }, []);

  const resetPanelBoundary = useCallback((index: number) => {
    const height = containerHeightRef.current;
    const defaults = defaultPanelHeights(height);
    const min = effectivePanelMin(height);
    panelCustomizedRef.current = false;
    setPanelHeights((previous) =>
      resetPanelPair(previous, index, defaults, min),
    );
  }, []);

  const onRailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = keyboardStep(event.shiftKey);
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        setRailWidth((width) =>
          clampRailWidth(width - step, window.innerWidth),
        );
        break;
      case "ArrowRight":
        event.preventDefault();
        setRailWidth((width) =>
          clampRailWidth(width + step, window.innerWidth),
        );
        break;
      case "Home":
        event.preventDefault();
        setRailWidth(RAIL_MIN_WIDTH);
        break;
      case "End":
        event.preventDefault();
        setRailWidth(railMaxWidth(window.innerWidth));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        resetRail();
        break;
      default:
        break;
    }
  };

  const onHeightKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = keyboardStep(event.shiftKey);
    const current = containerHeightRef.current;
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        commitHeight(current - step);
        break;
      case "ArrowDown":
        event.preventDefault();
        commitHeight(current + step);
        break;
      case "Home":
        event.preventDefault();
        commitHeight(DASHBOARD_MIN_HEIGHT);
        break;
      case "End":
        event.preventDefault();
        commitHeight(DASHBOARD_MAX_HEIGHT);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        resetHeight();
        break;
      default:
        break;
    }
  };

  const onPanelKeyDown =
    (index: number) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const step = keyboardStep(event.shiftKey);
      const height = containerHeightRef.current;
      const min = effectivePanelMin(height);
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          panelCustomizedRef.current = true;
          setPanelHeights((previous) =>
            applyPanelDelta(previous, index, -step, min),
          );
          break;
        case "ArrowDown":
          event.preventDefault();
          panelCustomizedRef.current = true;
          setPanelHeights((previous) =>
            applyPanelDelta(previous, index, step, min),
          );
          break;
        case "Home":
          event.preventDefault();
          panelCustomizedRef.current = true;
          setPanelHeights((previous) =>
            setPanelHeight(previous, index, min, height, min),
          );
          break;
        case "End":
          event.preventDefault();
          panelCustomizedRef.current = true;
          setPanelHeights((previous) =>
            setPanelHeight(
              previous,
              index,
              panelMaxHeight(height, PANEL_MIN_HEIGHT),
              height,
              min,
            ),
          );
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          resetPanelBoundary(index);
          break;
        default:
          break;
      }
    };

  const viewportWidth =
    typeof window === "undefined" ? 0 : window.innerWidth;
  const maxRailWidth = railMaxWidth(viewportWidth);
  const minPanelHeight = effectivePanelMin(containerHeight);
  const maxPanelHeight = panelMaxHeight(containerHeight);

  if (!wide) {
    return (
      <div className="runtime-dashboard">
        <section className="akg-panel" aria-label="AKG Traversal">
          {graph}
        </section>
        <aside id={SIDEBAR_ID} className="runtime-sidebar">
          {panels.map((panel, index) => (
            <section
              key={panelId(index)}
              id={panelId(index)}
              aria-label={panel.label}
            >
              {panel.content}
            </section>
          ))}
        </aside>
      </div>
    );
  }

  const dashboardStyle: CSSProperties & Record<`--${string}`, string> = {
    gridTemplateColumns: `minmax(0, 1fr) ${SPLITTER_SIZE}px ${Math.round(railWidth)}px`,
    gridTemplateRows: "minmax(0, 1fr) auto",
    columnGap: 0,
    rowGap: 0,
  };
  if (customHeight !== null) {
    // An explicit height replaces the `--live-height` clamp for both the
    // graph panel and the stacked rail.
    dashboardStyle["--live-height"] = `${Math.round(customHeight)}px`;
  }

  const rowTemplate = panelHeights
    .flatMap((height, index) =>
      index === 0
        ? [`${Math.round(height)}px`]
        : [`${SPLITTER_SIZE}px`, `${Math.round(height)}px`],
    )
    .join(" ");
  const sidebarStyle: CSSProperties = {
    gridTemplateRows: rowTemplate,
    gap: 0,
  };

  return (
    <div
      id={DASHBOARD_ID}
      className={cn(
        "runtime-dashboard",
        styles.dashboard,
        activeHandle !== null && styles.resizing,
      )}
      style={dashboardStyle}
    >
      <section className="akg-panel" aria-label="AKG Traversal">
        {graph}
      </section>

      <div
        id={RAIL_HANDLE_ID}
        role="separator"
        aria-label="Resize runtime rail"
        aria-orientation="vertical"
        aria-controls={SIDEBAR_ID}
        aria-valuemin={RAIL_MIN_WIDTH}
        aria-valuemax={maxRailWidth}
        aria-valuenow={Math.round(railWidth)}
        aria-valuetext={`${Math.round(railWidth)} pixels`}
        tabIndex={0}
        className={cn(
          styles.railHandle,
          activeHandle === "rail" && styles.handleActive,
        )}
        onPointerDown={(event) =>
          beginPointerDrag(
            event,
            (pointerId) => ({
              kind: "rail",
              pointerId,
              startX: event.clientX,
              startWidth: railWidth,
            }),
            "col-resize",
          )
        }
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.kind !== "rail" || drag.pointerId !== event.pointerId)
            return;
          const delta = drag.startX - event.clientX;
          setRailWidth(
            clampRailWidth(drag.startWidth + delta, window.innerWidth),
          );
        }}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onLostPointerCapture={finishPointerDrag}
        onKeyDown={onRailKeyDown}
        onDoubleClick={resetRail}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className={styles.handleGrip} aria-hidden="true" />
      </div>

      <aside
        ref={asideRef}
        id={SIDEBAR_ID}
        className={cn("runtime-sidebar", styles.sidebar)}
        style={sidebarStyle}
      >
        {panels.map((panel, index) => (
          <Fragment key={panelId(index)}>
            {index > 0 && (
              <div
                role="separator"
                aria-label={panelResizeLabel(panels[index - 1].label)}
                aria-orientation="horizontal"
                aria-controls={`${panelId(index - 1)} ${panelId(index)}`}
                aria-valuemin={minPanelHeight}
                aria-valuemax={maxPanelHeight}
                aria-valuenow={Math.round(panelHeights[index - 1] ?? 0)}
                aria-valuetext={`${Math.round(
                  panelHeights[index - 1] ?? 0,
                )} pixels`}
                tabIndex={0}
                className={cn(
                  styles.panelHandle,
                  activeHandle === index - 1 && styles.handleActive,
                )}
                onPointerDown={(event) =>
                  beginPointerDrag(
                    event,
                    (pointerId) => ({
                      kind: "panel",
                      index: index - 1,
                      pointerId,
                      startY: event.clientY,
                      startHeights: [...panelHeights],
                    }),
                    "row-resize",
                  )
                }
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (
                    !drag ||
                    drag.kind !== "panel" ||
                    drag.pointerId !== event.pointerId
                  )
                    return;
                  const min = effectivePanelMin(containerHeightRef.current);
                  panelCustomizedRef.current = true;
                  setPanelHeights(
                    applyPanelDelta(
                      drag.startHeights,
                      drag.index,
                      event.clientY - drag.startY,
                      min,
                    ),
                  );
                }}
                onPointerUp={finishPointerDrag}
                onPointerCancel={finishPointerDrag}
                onLostPointerCapture={finishPointerDrag}
                onKeyDown={onPanelKeyDown(index - 1)}
                onDoubleClick={() => resetPanelBoundary(index - 1)}
                onDragStart={(event) => event.preventDefault()}
              >
                <span className={styles.handleGrip} aria-hidden="true" />
              </div>
            )}
            <section
              id={panelId(index)}
              className={styles.panel}
              aria-label={panel.label}
            >
              {panel.content}
            </section>
          </Fragment>
        ))}
      </aside>

      <div
        id={HEIGHT_HANDLE_ID}
        role="separator"
        aria-label="Resize live monitor height"
        aria-orientation="horizontal"
        aria-controls={DASHBOARD_ID}
        aria-valuemin={DASHBOARD_MIN_HEIGHT}
        aria-valuemax={DASHBOARD_MAX_HEIGHT}
        aria-valuenow={Math.round(containerHeight)}
        aria-valuetext={`${Math.round(containerHeight)} pixels`}
        tabIndex={0}
        className={cn(
          styles.heightHandle,
          activeHandle === "height" && styles.handleActive,
        )}
        onPointerDown={(event) =>
          beginPointerDrag(
            event,
            (pointerId) => ({
              kind: "height",
              pointerId,
              startY: event.clientY,
              startHeight: containerHeightRef.current,
            }),
            "row-resize",
          )
        }
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (
            !drag ||
            drag.kind !== "height" ||
            drag.pointerId !== event.pointerId
          )
            return;
          commitHeight(drag.startHeight + (event.clientY - drag.startY));
        }}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onLostPointerCapture={finishPointerDrag}
        onKeyDown={onHeightKeyDown}
        onDoubleClick={resetHeight}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className={styles.handleGrip} aria-hidden="true" />
      </div>
    </div>
  );
}
