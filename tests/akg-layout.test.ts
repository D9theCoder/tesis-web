import { describe, expect, it } from "vitest";
import {
  layoutAkg,
  surfaceGroups,
  focusNodeIds,
  traversedPairs,
  directedPair,
  shortNodeLabel,
  type AkgLayout,
} from "@/lib/akg-layout";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import type { AkgSnapshot } from "@/lib/schemas";

function checkGeometry(layout: AkgLayout) {
  for (const a of layout.nodes)
    for (const b of layout.nodes) {
      if (a === b) continue;
      expect(
        a.x >= b.x + b.width ||
          b.x >= a.x + a.width ||
          a.y >= b.y + b.height ||
          b.y >= a.y + a.height,
        `${a.node.id} overlaps ${b.node.id}`,
      ).toBe(true);
    }
  for (const { edge, points: sections } of layout.edges)
    for (const points of sections)
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        expect(a.x === b.x || a.y === b.y, `non-orthogonal ${edge.id}`).toBe(
          true,
        );
        for (const node of layout.nodes.filter(
          (n) => n.node.id !== edge.source && n.node.id !== edge.target,
        )) {
          const intersects =
            a.x === b.x
              ? a.x > node.x &&
                a.x < node.x + node.width &&
                Math.max(a.y, b.y) > node.y &&
                Math.min(a.y, b.y) < node.y + node.height
              : a.y > node.y &&
                a.y < node.y + node.height &&
                Math.max(a.x, b.x) > node.x &&
                Math.min(a.x, b.x) < node.x + node.width;
          expect(
            intersects,
            `${edge.source} → ${edge.target} crosses ${node.node.id}`,
          ).toBe(false);
        }
      }
  for (const edge of layout.edges) {
    const source = layout.nodes.find((n) => n.node.id === edge.edge.source)!;
    const target = layout.nodes.find((n) => n.node.id === edge.edge.target)!;
    const first = edge.points[0][0],
      last = edge.points.at(-1)!.at(-1)!;
    expect(first.x).toBeCloseTo(source.x + source.width);
    expect(first.y).toBeGreaterThanOrEqual(source.y);
    expect(first.y).toBeLessThanOrEqual(source.y + source.height);
    expect(last.x).toBeCloseTo(target.x);
    expect(last.y).toBeGreaterThanOrEqual(target.y);
    expect(last.y).toBeLessThanOrEqual(target.y + target.height);
  }
}
describe("deterministic routed layout", () => {
  it("places the complete snapshot without overlaps or edges through unrelated nodes", async () => {
    const layout = await layoutAkg(AKG_SNAPSHOT);
    expect(layout.nodes).toHaveLength(29);
    expect(layout.edges).toHaveLength(38);
    expect(layout.groups).toHaveLength(3);
    checkGeometry(layout);
    expect(await layoutAkg(structuredClone(AKG_SNAPSHOT))).toBe(layout);
    expect(surfaceGroups(AKG_SNAPSHOT).get("bf_dictionary_confirmed")).toBe(
      "brute_force",
    );
    expect(surfaceGroups(AKG_SNAPSHOT).has("authenticated_session")).toBe(
      false,
    );
  });
  it("handles unfamiliar nodes, long labels, shared outcomes, cycles and return edges", async () => {
    const snapshot: AkgSnapshot = structuredClone(AKG_SNAPSHOT);
    snapshot.nodes.push({
      id: "unfamiliar",
      kind: "method",
      type: "method",
      label:
        "An exceptionally long unfamiliar method label that must be inspectable",
    });
    snapshot.edges.push(
      {
        id: "return-new",
        source: "data_exfiltrated",
        target: "unfamiliar",
        isChain: true,
        preconditions: [],
        priority: 1,
      },
      {
        id: "cycle-new",
        source: "unfamiliar",
        target: "sqli",
        isChain: true,
        preconditions: [],
        priority: 1,
      },
    );
    const layout = await layoutAkg(snapshot);
    checkGeometry(layout);
    expect(
      layout.nodes.filter((n) => n.node.id === "data_exfiltrated"),
    ).toHaveLength(1);
    expect(shortNodeLabel(snapshot.nodes.at(-1)!)).toContain("exceptionally");
  });
  it("rejects malformed topology visibly rather than dropping nodes/edges", async () => {
    await expect(
      layoutAkg({ ...AKG_SNAPSHOT, nodes: AKG_SNAPSHOT.nodes.slice(1) }),
    ).rejects.toThrow("Missing endpoint");
  });
  it("highlights only directed consecutive pairs and preserves full traversal when focused", () => {
    const path = [
      "unauthenticated",
      "brute_force",
      "bf_dictionary",
      "bf_dictionary_confirmed",
      "brute_force_confirmed",
      "authenticated_session",
      "ac_idor",
      "ac_idor_confirmed",
      "access_control_confirmed",
      "data_exfiltrated",
    ];
    const pairs = traversedPairs(path);
    expect(pairs.size).toBe(9);
    expect(pairs.has(directedPair("access_control", "ac_idor"))).toBe(false);
    const focus = focusNodeIds(AKG_SNAPSHOT, path, "data_exfiltrated", null);
    for (const id of path) expect(focus.has(id)).toBe(true);
    expect(focus.has("sqli_time_blind")).toBe(false);
    expect(AKG_SNAPSHOT.nodes).toHaveLength(29);
  });
});
