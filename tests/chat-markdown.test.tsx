import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatMarkdown } from "@/components/chat/markdown";

describe("chat Markdown", () => {
  it("renders model formatting, code, lists, quotes, and tables", () => {
    render(<ChatMarkdown>{[
      "## Answer", "", "**Clarifying s1mple's profile** with *emphasis* and `inline code`.", "",
      "- First item", "- Second item", "", "> A quoted note", "",
      "```python", "print('hello')", "```", "", "| Model | Effort |", "| --- | --- |", "| Terra | high |",
    ].join("\n")}</ChatMarkdown>);
    expect(screen.getByRole("heading", { name: "Answer", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Clarifying s1mple's profile", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("emphasis", { selector: "em" })).toBeInTheDocument();
    expect(screen.getByText("inline code", { selector: "code" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("A quoted note").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("print('hello')").closest("pre")).not.toBeNull();
    expect(within(screen.getByRole("table")).getByRole("cell", { name: "Terra" })).toBeInTheDocument();
  });

  it("ignores embedded HTML and unsafe links and keeps images as explicit links", () => {
    const { container } = render(<ChatMarkdown>{[
      "[Unsafe link](javascript:alert%281%29)", "", "![Diagram](https://example.com/diagram.png)", "",
      "<script>window.untrusted = true</script>", "", '<img src="https://example.com/tracker.png" onerror="alert(1)">',
    ].join("\n")}</ChatMarkdown>);
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href", expect.stringMatching(/^javascript:/));
    expect(screen.getByRole("link", { name: "Diagram" })).toHaveAttribute("href", "https://example.com/diagram.png");
  });

  it("updates incomplete Markdown when another streamed chunk completes it", () => {
    const { rerender } = render(<ChatMarkdown>{"**Clarifying"}</ChatMarkdown>);
    expect(screen.getByText("**Clarifying")).toBeInTheDocument();
    rerender(<ChatMarkdown>{"**Clarifying the profile**\n\n```ts\nconst value = 1;"}</ChatMarkdown>);
    expect(screen.getByText("Clarifying the profile", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("const value = 1;").closest("pre")).not.toBeNull();
  });
});
