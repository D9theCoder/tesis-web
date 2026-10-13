import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/ui/copy-button";

describe("source identifier copying", () => {
  it("copies the complete supplied identifier and reports completion", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const hash = "1".repeat(64);
    render(<CopyButton value={hash} label="source hash" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy source hash" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("source hash copied"));
    expect(writeText).toHaveBeenCalledWith(hash);
  });
  it("clears copied feedback when the displayed identifier changes", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const { rerender } = render(<CopyButton value="parent" label="execution ID" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
    rerender(<CopyButton value="child" label="execution ID" />);
    expect(screen.getByRole("button")).toHaveTextContent(/^Copy$/);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("ignores an old request even if the user returns to the original value", async () => {
    let resolve!: () => void;
    const writeText = vi.fn().mockReturnValue(new Promise<void>(yes => { resolve = yes; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { rerender } = render(<CopyButton value="parent" label="execution ID" />);
    fireEvent.click(screen.getByRole("button"));
    rerender(<CopyButton value="child" label="execution ID" />);
    rerender(<CopyButton value="parent" label="execution ID" />);
    await act(async () => { resolve(); });
    expect(screen.getByRole("button")).toHaveTextContent(/^Copy$/);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("does not let an older failure overwrite a newer successful copy", async () => {
    let reject!: (reason: Error) => void;
    const writeText = vi.fn().mockReturnValueOnce(new Promise<void>((_yes, no) => { reject = no; })).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyButton value="source" label="source hash" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
    await act(async () => { reject(new Error("permission denied")); });
    expect(screen.getByRole("status")).toHaveTextContent("source hash copied");
  });
});
