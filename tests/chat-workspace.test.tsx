import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

const model = { id: "codex_profile", label: "codex / model-one", model: "model-one", effort: "low", efforts: ["low", "high"], supported: true };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("chat workspace", () => {
  it("streams distinct reasoning and answer events and keeps model choices local to the chat", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (body.action === "models") return Response.json({ targets: [model] });
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        for (const event of [{ type: "summary", text: "summary text" }, { type: "trace", text: "trace text" }, { type: "text", text: "answer" }, { type: "done" }]) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      } }));
    }));
    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await screen.findByRole("option", { name: "codex / model-one" });
    fireEvent.change(screen.getByLabelText("Reasoning effort"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("answer")).toBeInTheDocument();
    expect(screen.getByText("summary text")).toBeInTheDocument();
    expect(screen.getByText("trace text")).toBeInTheDocument();
    expect(calls[1]).toEqual({ action: "send", target: "codex_profile", effort: "high", generateTitle: true, messages: [{ role: "user", content: "Hello" }] });
    await waitFor(() => expect(localStorage.getItem("tesis.chat.v1")).toContain("summary text"));
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
});
