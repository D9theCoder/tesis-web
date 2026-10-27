import { spawn } from "node:child_process";
import { z } from "zod";

import { runBridge } from "@/lib/server/control/bridge";
import { ensureProfile } from "@/lib/server/control/config-store";
import { ControlError } from "@/lib/server/control/errors";
import { tesisProcessEnv } from "@/lib/server/control/env";
import { assertControlAllowed } from "@/lib/server/control/guard";
import { bridgeScriptPath, profileConfigPath, tesisPython } from "@/lib/server/control/paths";
import { readJsonBody } from "@/lib/server/control/request";
import { controlResponse } from "@/lib/server/control/response";
import { isSecretKey, tesisRoot } from "@/lib/server/fs-util";
import { retrieveDocumentation } from "@/lib/server/chat/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("models") }).strict(),
  z.object({ action: z.literal("send"), target: z.string().min(1).max(200),
    expectedModel: z.string().min(1).max(500), effort: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).nullable(), generateTitle: z.boolean(),
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(50000) }).strict()).min(1).max(100),
  }).strict(),
]);

export async function POST(req: Request) {
  try {
    assertControlAllowed(req);
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) {
      throw new ControlError("Cross-origin chat requests are not allowed.", 403);
    }
    const body = await readJsonBody(req, requestSchema);
    if (body.action === "send" && (body.messages.at(-1)?.role !== "user" || body.messages.reduce((n, m) => n + m.content.length, 0) > 200_000)) {
      throw new ControlError("The conversation must end with a user message and fit within 200,000 characters.", 400);
    }
    await ensureProfile();
    if (body.action === "models") {
      return Response.json(await runBridge("chat-models"), { headers: { "Cache-Control": "no-store" } });
    }
    const env = await tesisProcessEnv({ TESIS_ROOT: tesisRoot(), TESIS_WEB_CONFIG_PATH: profileConfigPath() });
    const knownSecrets = Object.entries(env).filter(([key, value]) => isSecretKey(key) && typeof value === "string" && value.length >= 4).map(([, value]) => value!);
    const query = body.messages.filter((message) => message.role === "user").slice(-2).reverse().map((message) => message.content.slice(0, 4000)).join("\n");
    const excerpts = await retrieveDocumentation(query, process.cwd(), tesisRoot(), knownSecrets);
    const child = spawn(tesisPython(), [bridgeScriptPath(), "chat"], {
      cwd: tesisRoot(), env, stdio: ["pipe", "pipe", "pipe"],
    });
    const encoder = new TextEncoder();
    let closed = false;
    let bytes = 0;
    const stop = () => { if (!closed) child.kill("SIGKILL"); };
    const timer = setTimeout(stop, 180_000);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const end = () => { if (closed) return; closed = true; clearTimeout(timer); req.signal.removeEventListener("abort", stop); controller.close(); };
        const fail = () => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: "The chat stream ended unexpectedly." })}\n`)); };
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "sources", sources: excerpts.map(({ id, source, line }) => ({ id, source, line })) })}\n`));
        child.stdout.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) { fail(); stop(); return; }
          if (!closed) controller.enqueue(new Uint8Array(chunk));
        });
        child.stderr.resume();
        child.on("error", () => { fail(); end(); });
        child.on("close", (code) => { if (code !== 0) fail(); end(); });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify({ ...body, documentation: true, excerpts }));
        req.signal.addEventListener("abort", stop, { once: true });
        if (req.signal.aborted) stop();
      },
      cancel() { stop(); closed = true; clearTimeout(timer); req.signal.removeEventListener("abort", stop); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return controlResponse(async () => { throw error; });
  }
}
