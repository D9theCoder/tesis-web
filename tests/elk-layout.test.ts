import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutElkGraph } from "@/lib/elk-layout";

const layout = vi.hoisted(() => vi.fn());
vi.mock("elkjs/lib/elk-api.js", () => ({ default: class { layout = layout; } }));
const workers: FakeWorker[] = [];
class FakeWorker extends EventTarget {
  terminate = vi.fn();
  constructor() { super(); workers.push(this); }
}
beforeEach(() => { workers.length = 0; layout.mockReset(); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("layout worker lifecycle", () => {
  it("returns layout and releases the worker after success", async () => {
    const graph = { id: "root", children: [{ id: "placed", x: 5 }] };
    layout.mockResolvedValue(graph);
    await expect(layoutElkGraph({ id: "root" })).resolves.toEqual(graph);
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("rejects a worker load failure and allows a fresh retry", async () => {
    layout.mockReturnValueOnce(new Promise(() => {})).mockResolvedValue({ id: "retry" });
    const failure = expect(layoutElkGraph({ id: "root" })).rejects.toThrow("failed to load");
    workers[0].dispatchEvent(new ErrorEvent("error", { cancelable: true }));
    await failure;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    await expect(layoutElkGraph({ id: "root" })).resolves.toEqual({ id: "retry" });
    expect(workers).toHaveLength(2);
  });
  it("bounds an unresponsive worker and terminates it", async () => {
    vi.useFakeTimers();
    layout.mockReturnValue(new Promise(() => {}));
    const failure = expect(layoutElkGraph({ id: "root" })).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
});
