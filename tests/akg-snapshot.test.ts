import { describe, expect, it } from "vitest";
import { normalizeAkgSnapshot } from "@/lib/akg-snapshot";
import { AKG_SNAPSHOT } from "@/lib/akg-static";
import { layoutAkg } from "@/lib/akg-layout";

describe("resolved snapshot identity", () => {
  it("enriches Python generic kinds while preserving every supplied node and directed edge", async () => {
    const raw = {
      schema_version: "python.v1",
      nodes: AKG_SNAPSHOT.nodes.map((node) => ({
        id: node.id,
        type: node.kind === "method" ? "method" : "node",
        surface: node.surface,
      })),
      edges: AKG_SNAPSHOT.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        is_chain: edge.isChain,
        preconditions: edge.preconditions,
        target_agent: edge.targetAgent,
      })),
    };
    const snapshot = normalizeAkgSnapshot(raw);
    expect(snapshot.nodes.map((node) => [node.id, node.kind])).toEqual(
      AKG_SNAPSHOT.nodes.map((node) => [node.id, node.kind]),
    );
    expect(
      snapshot.edges.map((edge) => [edge.source, edge.target, edge.isChain]),
    ).toEqual(
      AKG_SNAPSHOT.edges.map((edge) => [
        edge.source,
        edge.target,
        edge.isChain,
      ]),
    );
    expect((await layoutAkg(snapshot)).groups).toHaveLength(3);
  });
  it("does not replace an empty edge set or unknown nodes with compiled topology", () => {
    const snapshot = normalizeAkgSnapshot({
      nodes: [{ id: "new-node", type: "new-kind" }],
      edges: [],
    });
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0].id).toBe("new-node");
    expect(snapshot.edges).toEqual([]);
    expect(normalizeAkgSnapshot({ nodes: [], edges: [] }).nodes).toEqual([]);
  });
});
