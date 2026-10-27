import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`saved model Markdown renders at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light", reducedMotion: "reduce" });
  const answer = ["## Formatted answer", "", "Use **bold text** with `inline code`.", "",
    "| Model | Effort |", "| --- | --- |", "| Terra | high |", "",
    "```ts", `const value = \"${"x".repeat(160)}\";`, "```"].join("\n");
  await page.addInitScript(({ answer }) => localStorage.setItem("tesis.chat.v1", JSON.stringify([{
    id: "markdown", title: "Markdown example", target: "codex", modelName: "fixture", effort: "high", messages: [
      { id: "user", role: "user", text: "Show Markdown" },
      { id: "assistant", role: "assistant", model: "codex / fixture", status: "complete", text: answer,
        summary: "**Clarifying s1mple's profile**\n\n- Check the profile\n- Explain the result" },
    ],
  }])), { answer });
  await page.route("**/api/control/chat", route => route.fulfill({ json: { targets: [
    { id: "codex", label: "codex / fixture", model: "fixture", effort: "high", efforts: ["low", "high"], supported: true },
  ] } }));
  await page.goto("/chat");
  await page.getByText("Reasoning summary", { exact: true }).click();
  await expect(page.locator("strong").filter({ hasText: "Clarifying s1mple's profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formatted answer", level: 2 })).toBeAttached();
  await expect(page.getByRole("cell", { name: "Terra" })).toBeAttached();
  await expect(page.locator("pre code")).toContainText("const value");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("tesis.chat.v1"))).toContain("**Clarifying");
  await page.screenshot({ path: testInfo.outputPath(`markdown-${width}.png`), fullPage: true, animations: "disabled" });
});

test("Codex summaries are shown and restored without raw reasoning traces", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/control/chat", async (route) => {
    if (route.request().postDataJSON().action === "models") {
      return route.fulfill({ json: { targets: [{ id: "codex", label: "codex / gpt-fixture", model: "gpt-fixture", effort: "high", efforts: ["low", "high"], supported: true }] } });
    }
    return route.fulfill({ contentType: "application/x-ndjson", body: [
      { type: "text", text: "A completed answer." },
      { type: "replace_summary", text: "A provider-returned reasoning summary." },
      { type: "done" },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n" });
  });
  await page.goto("/chat");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByRole("option", { name: "codex / gpt-fixture" })).toHaveCount(1);
  await page.getByLabel("Message", { exact: true }).fill("Hello model");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("A completed answer.")).toBeVisible();
  await page.getByText("Reasoning summary", { exact: true }).click();
  await expect(page.getByText("A provider-returned reasoning summary.")).toBeVisible();
  await expect(page.getByText("Reasoning trace", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/No reasoning/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tesis.chat.v1"))).toContain("A provider-returned reasoning summary.");
  await page.screenshot({ path: testInfo.outputPath("codex-summary.png"), animations: "disabled", fullPage: true });
  await page.reload();
  await page.getByText("Reasoning summary", { exact: true }).click();
  await expect(page.getByText("A provider-returned reasoning summary.")).toBeVisible();
  await expect(page.getByText(/No reasoning/)).toHaveCount(0);
});

test("chat streams an answer and reasoning, and restores the conversation", async ({ page }) => {
  await page.route("**/api/control/chat", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "models") return route.fulfill({ json: { targets: [{ id: "codex_2", label: "codex / gpt-fixture", model: "gpt-fixture", effort: "low", efforts: ["low", "high"], supported: true }] } });
    return route.fulfill({ contentType: "application/x-ndjson", body: [
      { type: "sources", sources: [{ id: "S1", source: "tesis/README.md", line: 12 }] },
      { type: "summary", text: "A provider summary." }, { type: "trace", text: "A provider trace." }, { type: "text", text: "A streamed answer [S1]." },
      { type: "response_done" }, { type: "title", text: "Model conversation" }, { type: "done" },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n" });
  });
  await page.goto("/chat");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByRole("option", { name: "codex / gpt-fixture" })).toHaveCount(1);
  await page.getByLabel("Reasoning effort").selectOption("high");
  const input = page.getByLabel("Message", { exact: true });
  await input.fill("Hello model");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Hello model\n");
  await input.press("Enter");
  await expect(page.getByText("A streamed answer [S1].")).toBeVisible();
  await expect(page.getByRole("button", { name: "Model conversation" })).toBeVisible();
  await page.getByText("Reasoning summary").click();
  await expect(page.getByText("A provider summary.")).toBeVisible();
  await page.getByText("Reasoning trace", { exact: true }).click();
  await expect(page.getByText("A provider trace.")).toBeVisible();
  await page.getByText("Documentation supplied (1)").click();
  await expect(page.getByText("[S1] tesis/README.md:12")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("tesis.chat.v1"))).toContain("A streamed answer [S1].");
  await page.reload();
  await expect(page.getByText("A streamed answer [S1].")).toBeVisible();
  await expect(page.getByLabel("Reasoning effort")).toHaveValue("high");
  await page.getByRole("button", { name: "Delete conversation", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete conversation" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("A streamed answer [S1].")).toBeVisible();
});

test("a long conversation list stays reachable", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tesis.chat.v1", JSON.stringify(Array.from({ length: 40 }, (_, index) => ({ id: `chat-${index}`, title: `Conversation ${index}`, target: "", effort: "", messages: [] })) )));
  await page.route("**/api/control/chat", (route) => route.fulfill({ json: { targets: [] } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/chat");
  const last = page.getByRole("button", { name: "Conversation 39" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await last.click();
  await expect(last).toHaveAttribute("aria-current", "true");
});

test("streamed output follows the bottom without pulling a reader away from older messages", async ({ page }) => {
  await page.addInitScript(() => {
    const messages = Array.from({ length: 30 }, (_, index) => ({ id: `m-${index}`, role: index % 2 ? "assistant" : "user", text: `Earlier message ${index}`, status: "complete" }));
    localStorage.setItem("tesis.chat.v1", JSON.stringify([{ id: "long", title: "Long chat", target: "fixture", effort: "", messages }]));
    window.fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.action === "models") return Response.json({ targets: [{ id: "fixture", label: "codex / fixture", model: "fixture", effort: null, efforts: ["low"], supported: true }] });
      const encoder = new TextEncoder();
      let count = 0;
      return new Response(new ReadableStream({ start(controller) {
        const timer = setInterval(() => {
          if (count++ < 15) controller.enqueue(encoder.encode(JSON.stringify({ type: "text", text: `Streaming ${count}\n` }) + "\n"));
          else { clearInterval(timer); controller.enqueue(encoder.encode('{"type":"done"}\n')); controller.close(); }
        }, 100);
      } }));
    };
  });
  await page.goto("/chat");
  await expect(page.getByRole("option", { name: "codex / fixture" })).toHaveCount(1);
  const messages = page.locator('[aria-label="Messages"]');
  await expect.poll(() => messages.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5);
  await page.getByLabel("Message", { exact: true }).fill("Continue");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Streaming 1/)).toBeVisible();
  await messages.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  await expect(page.getByText(/Streaming 15/)).toHaveCount(1);
  expect(await messages.evaluate((el) => el.scrollTop)).toBe(0);
});
