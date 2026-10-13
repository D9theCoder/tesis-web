import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
