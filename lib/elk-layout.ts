import ELK, { type ElkNode } from "elkjs/lib/elk-api.js";

export function layoutElkGraph(graph: ElkNode): Promise<ElkNode> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Graph layout requires browser Web Workers"));
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL("./elk.worker.ts", import.meta.url), {
      type: "module",
      name: "tesis-akg-layout",
    });
  } catch (error) {
    return Promise.reject(error);
  }
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<ElkNode>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Graph layout worker timed out")), 30_000);
    worker.addEventListener("error", event => {
      event.preventDefault();
      reject(new Error("Graph layout worker failed to load or execute"));
    }, { once: true });
    worker.addEventListener("messageerror", () => {
      reject(new Error("Graph layout worker returned an unreadable response"));
    }, { once: true });
    const engine = new ELK({ workerFactory: () => worker });
    engine.layout(graph).then(resolve, reject);
  }).finally(() => {
    clearTimeout(timer);
    worker.terminate();
  });
}
