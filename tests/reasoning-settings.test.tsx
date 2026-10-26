import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReasoningSettings } from "@/components/settings/reasoning-settings";
import { configureReasoning } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({ configureReasoning: vi.fn() }));

const known = { id: "gpt", label: "GPT model", model: "gpt-model", effort: "low", efforts: ["low", "high"], supported: true };
const unknown = { ...known, id: "unknown", label: "Unknown model", efforts: null };
const describeResult = { targets: [known, unknown], fallbackEfforts: ["off", "low", "medium", "high"] };
const props = { yaml: "models: {}", overrides: {}, apiProviderKeys: {}, disabled: false, onApply: vi.fn() };
const patch = { "models.gpt.reasoning_effort": "high" };

beforeEach(() => {
  vi.mocked(configureReasoning).mockReset().mockResolvedValue(describeResult);
  props.onApply.mockReset();
});

describe("reasoning settings", () => {
  it("uses only the exact model catalog and stages a known value offline", async () => {
    render(<ReasoningSettings {...props} />);
    const selector = await screen.findByLabelText("Reasoning effort");
    expect(selector).toHaveValue("low");
    expect(screen.queryByRole("option", { name: /^medium$/ })).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "high" } });
    vi.mocked(configureReasoning).mockResolvedValueOnce({ accepted: true, overrides: patch });
    fireEvent.click(screen.getByRole("button", { name: "Apply effort" }));
    await waitFor(() => expect(props.onApply).toHaveBeenCalledWith(patch));
    expect(configureReasoning).toHaveBeenLastCalledWith(expect.objectContaining({ action: "apply", effort: "high", target: "gpt" }));
  });

  it("requires an explicit support check for an unknown model before Apply", async () => {
    render(<ReasoningSettings {...props} />);
    fireEvent.change(await screen.findByLabelText("Model to configure"), { target: { value: "unknown" } });
    expect(screen.getByText(/Unknown model, please set your own/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply effort" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check reasoning support" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("may spend provider credits");
    expect(configureReasoning).toHaveBeenCalledTimes(1);
    vi.mocked(configureReasoning).mockResolvedValueOnce({ accepted: true, overrides: patch });
    fireEvent.click(screen.getByRole("button", { name: "Run support check" }));
    await screen.findByText(/Provider accepted the effort/);
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply effort" }));
    expect(props.onApply).toHaveBeenCalledWith(patch);
    expect(configureReasoning).toHaveBeenCalledTimes(2);
  });

  it("invalidates a successful check when effort changes and keeps defaults offline", async () => {
    render(<ReasoningSettings {...props} />);
    fireEvent.change(await screen.findByLabelText("Model to configure"), { target: { value: "unknown" } });
    fireEvent.change(screen.getByLabelText("Reasoning effort"), { target: { value: "inherit" } });
    expect(screen.getByRole("button", { name: "Apply effort" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Check reasoning support" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reasoning effort"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Custom effort"), { target: { value: "bad value" } });
    expect(screen.getByRole("button", { name: "Check reasoning support" })).toBeDisabled();
  });

  it("ignores a late support check after switching models", async () => {
    render(<ReasoningSettings {...props} />);
    fireEvent.change(await screen.findByLabelText("Model to configure"), { target: { value: "unknown" } });
    let finish!: (value: { accepted: boolean; overrides: Record<string, unknown> }) => void;
    vi.mocked(configureReasoning).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Check reasoning support" }));
    fireEvent.click(screen.getByRole("button", { name: "Run support check" }));
    fireEvent.change(screen.getByLabelText("Model to configure"), { target: { value: "gpt" } });
    await act(async () => finish({ accepted: true, overrides: patch }));
    expect(screen.queryByText(/Provider accepted the effort/)).not.toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("keeps a failed support check blocked", async () => {
    render(<ReasoningSettings {...props} />);
    fireEvent.change(await screen.findByLabelText("Model to configure"), { target: { value: "unknown" } });
    vi.mocked(configureReasoning).mockResolvedValueOnce({ accepted: false, error: "Provider rejected effort." });
    fireEvent.click(screen.getByRole("button", { name: "Check reasoning support" }));
    fireEvent.click(screen.getByRole("button", { name: "Run support check" }));
    await screen.findByText("Provider rejected effort.");
    expect(screen.getByRole("button", { name: "Apply effort" })).toBeDisabled();
  });
});
