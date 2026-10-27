import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { KnowledgeControls } from "@/components/chat/knowledge-controls";

const model = { id: "codex_profile", label: "codex / model-one", model: "model-one", effort: "low", efforts: ["low", "high"], supported: true };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("chat workspace", () => {
  it("shows a completed Codex summary without requiring a raw trace", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      if (JSON.parse(String(init.body)).action === "models") return Response.json({ targets: [model] });
      return new Response([
        { type: "text", text: "answer" }, { type: "replace_summary", text: "Provider summary" }, { type: "done" },
      ].map((event) => JSON.stringify(event)).join("\n") + "\n");
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Provider summary")).toBeInTheDocument();
    expect(screen.getByText("Reasoning summary")).toBeInTheDocument();
    expect(screen.queryByText("Reasoning trace")).not.toBeInTheDocument();
    expect(screen.queryByText(/No reasoning/)).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("tesis.chat.v1")).toContain('"status":"complete"'));
    expect(localStorage.getItem("tesis.chat.v1")).toContain("Provider summary");
  });

  it("streams distinct reasoning and answer events and keeps model choices local to the chat", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (body.action === "models") return Response.json({ targets: [model] });
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        for (const event of [{ type: "summary", text: "**summary text**" }, { type: "trace", text: "`trace text`" }, { type: "text", text: "**answer**" }, { type: "done" }]) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      } }));
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Reasoning effort"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("answer", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("summary text", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("trace text", { selector: "code" })).toBeInTheDocument();
    expect(calls[1]).toEqual({ action: "send", target: "codex_profile", expectedModel: "model-one", effort: "high", generateTitle: true, messages: [{ role: "user", content: "Hello" }] });
    await waitFor(() => expect(localStorage.getItem("tesis.chat.v1")).toContain("**summary text**"));
    expect(within(screen.getByRole("region", { name: "Chat conversation" })).getByText("Reasoning summary")).toBeInTheDocument();
  });

  it("marks streams without a terminal event as incomplete", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => JSON.parse(String(init.body)).action === "models"
      ? Response.json({ targets: [model] }) : new Response('{"type":"text","text":"partial"}\n')));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/ended before the provider completed/)).toBeInTheDocument();
  });

  it("shows when semantic retrieval falls back to keywords", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => JSON.parse(String(init.body)).action === "models"
      ? Response.json({ targets: [model] }) : new Response('{"type":"sources","mode":"keyword","sources":[]}\n{"type":"text","text":"answer"}\n{"type":"done"}\n')));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Semantic search was unavailable; keyword search was used.")).toBeVisible();
  });

  it("refreshes model choices when a saved provider was removed", async () => {
    let modelReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.action === "models") return Response.json({ targets: modelReads++ === 0 ? [model] : [{ ...model, id: "other", label: "Other model" }] });
      return new Response('{"type":"error","error":"Choose a configured model in Settings."}\n');
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("This model is no longer configured. Choose another model.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other model" })).toBeInTheDocument();
  });

  it("requires confirmation if the same profile now names another model", async () => {
    localStorage.setItem("tesis.chat.v1", JSON.stringify([{ id: "chat", title: "Saved", target: "codex_profile", modelName: "old-model", effort: "", messages: [] }]));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ targets: [model] })));
    render(<ChatWorkspace />);
    expect(await screen.findByText(/This profile now uses/)).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use updated model" }));
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("detects a model changed after chat loaded before dispatch", async () => {
    let modelReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.action === "models") return Response.json({ targets: [modelReads++ === 0 ? model : { ...model, model: "model-two", label: "codex / model-two" }] });
      return new Response('{"type":"error","error":"The selected model has changed. Choose a model again."}\n');
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/This profile now uses/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use updated model" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeDisabled();
  });

  it("uploads a shared document and sends the selected run identity with the conversation", async () => {
    const file = { id: "file-1", name: "notes.md", createdAt: "2026-10-28T00:00:00Z", pages: 1 };
    const run = { executionId: "run-123", sha256: "a".repeat(64), name: "SQL injection", kind: "standalone", startedAt: "2026-10-20T10:00:00Z", executionStatus: "failed", securityOutcome: "confirmed", model: "fixture-model", surface: "form", securityLevel: "low" };
    let sent: unknown;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/knowledge")) return init?.method === "POST" ? Response.json({ file }) : Response.json({ files: [] });
      if (url.includes("/runs?")) return Response.json({ runs: [run], nextCursor: null, partial: false });
      const body = JSON.parse(String(init?.body));
      if (body.action === "models") return Response.json({ targets: [model] });
      sent = body;
      return new Response('{"type":"text","text":"The selected run failed."}\n{"type":"done"}\n');
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.click(screen.getByText("Shared files"));
    await screen.findByText("No files added yet.");
    fireEvent.change(screen.getByLabelText("Add a file"), { target: { files: [new File(["notes"], "notes.md", { type: "text/markdown" })] } });
    expect(await screen.findByText("notes.md")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Select run artifact"));
    const choice = await screen.findByRole("button", { name: /SQL injection/ });
    expect(choice).toHaveTextContent("fixture-model");
    expect(choice).toHaveTextContent("failed");
    fireEvent.click(choice);
    expect(screen.getByRole("button", { name: "Remove attached run" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Analyze this run" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The selected run failed.")).toBeInTheDocument();
    expect(sent).toMatchObject({ artifact: { executionId: "run-123", sha256: "a".repeat(64) } });
    await waitFor(() => expect(localStorage.getItem("tesis.chat.v1")).toContain("run-123"));
  });

  it("loads runs while the shared-file list is still loading", async () => {
    let finishFiles!: (response: Response) => void;
    const run = { executionId: "run-123", sha256: "a".repeat(64), name: "SQL injection", kind: "standalone", startedAt: null, executionStatus: null, securityOutcome: null, model: null, surface: null, securityLevel: null };
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("/knowledge")
      ? new Promise<Response>((resolve) => { finishFiles = resolve; })
      : Promise.resolve(Response.json({ runs: [run], nextCursor: null, partial: false }))));
    render(<KnowledgeControls onSelect={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByText("Shared files"));
    await screen.findByText("Loading files…");
    fireEvent.click(screen.getByText("Select run artifact"));
    expect(await screen.findByRole("button", { name: /SQL injection/ })).toBeVisible();
    finishFiles(Response.json({ files: [] }));
    await screen.findByText("No files added yet.");
  });
});
