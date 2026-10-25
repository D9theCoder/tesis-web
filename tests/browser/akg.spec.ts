import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const captures = "test-results/acceptance";

// The replay launcher lives inside a native <details> disclosure. A click that
// lands before the first client render after hydration is undone when React
// replaces the subtree, so reveal it until the disclosure stays open.
async function revealReplayLauncher(page: Page) {
  const demonstration = page.locator("details.runtime-demonstration");
  if (!(await demonstration.count())) return;
  const launcher = page.getByRole("button", {
    name: "Run seeded AKG traversal test",
  });
  await expect(async () => {
    const open = await demonstration.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    );
    if (!open) await demonstration.locator("summary").click();
    await expect(launcher).toBeVisible({ timeout: 750 });
  }).toPass({ timeout: 20000 });
}

test("long labels and unfamiliar nodes remain inspectable without changing topology", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/akg")).json();
  const longLabel = "An unfamiliar method with a deliberately long label that remains available in full through inspection";
  snapshot.nodes.push({ id: "unfamiliar-browser-node", type: "method", kind: "method", label: longLabel });
  await page.route("**/api/akg", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/runtime/runs*", (route) => route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }));
  await page.goto("/");
  const node = page.locator('.react-flow__node[data-id="unfamiliar-browser-node"]');
  await expect(node).toBeAttached();
  await expect(page.getByTestId("node-count")).toHaveText("30/30 nodes");
  await expect(page.locator(".react-flow__edge")).toHaveCount(snapshot.edges.length);
  const label = node.locator(".akg-node-label");
  expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px");
  expect(await label.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(32);
  await node.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Graph inspection" })).toContainText(longLabel);
  await expect(page.getByRole("complementary", { name: "Graph inspection" })).toContainText("unfamiliar-browser-node");
});

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [1024, 768],
  [390, 844],
]) {
  test(`replay, controls and mismatch at ${width}x${height}`, async ({
    page,
    request,
  }) => {
    await mkdir(captures, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await request.get("/api/mock/akg");
    expect(response.status()).toBe(200);
    const fixture = await response.json();
    expect(fixture.events).toHaveLength(18);
    expect(fixture.assertions.expected_path).toHaveLength(10);
    expect(fixture).not.toHaveProperty("verification");
    await page.route("**/api/runtime/runs*", (route) =>
      route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }),
    );
    await page.goto("/");
    await expect(page.locator(".react-flow__node-card")).toHaveCount(29);
    await expect(page.locator(".akg-view")).toHaveAttribute(
      "data-layout-ready",
      "true",
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: `${captures}/${width}-overview.png`,
      fullPage: true,
    });
    await revealReplayLauncher(page);
    await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
    await expect(page.getByTestId("replay-count")).toHaveText(
      "0/18 events reduced",
    );
    await expect(page.getByText("AKG verified", { exact: true })).toHaveCount(
      0,
    );
    const nodes = page.locator(".react-flow__node-card");
    await expect(nodes).toHaveCount(29);
    const positions = await nodes.evaluateAll((elements) =>
      elements.map((el) => [
        el.getAttribute("data-id"),
        (el as HTMLElement).style.transform,
      ]),
    );
    await expect
      .poll(
        () =>
          page
            .locator('[data-node-id="authenticated_session"]')
            .getAttribute("data-current"),
        { timeout: 15000, intervals: [50] },
      )
      .toBe("true");
    await page.screenshot({
      path: `${captures}/${width}-cross-surface.png`,
      fullPage: true,
    });
    await expect(page.getByText("AKG verified", { exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await expect(page.getByTestId("replay-count")).toHaveText(
      "18/18 events reduced",
    );
    await expect(page.locator('[data-traversed="true"]')).toHaveCount(9);
    expect(
      await nodes.evaluateAll((elements) =>
        elements.map((el) => [
          el.getAttribute("data-id"),
          (el as HTMLElement).style.transform,
        ]),
      ),
    ).toEqual(positions);
    await page.screenshot({
      path: `${captures}/${width}-final.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Focus path", exact: true }).click();
    for (const id of fixture.assertions.expected_path)
      await expect(page.locator(`[data-node-id="${id}"]`)).toBeAttached();
    await expect(page.locator('[data-traversed="true"]')).toHaveCount(9);
    await page.getByRole("button", { name: "Full graph", exact: true }).click();
    await page.getByRole("button", { name: "Center current" }).click();
    const viewport = page.locator(".react-flow__viewport");
    const before = await viewport.getAttribute("style");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(viewport).not.toHaveAttribute("style", before!);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const prior = await viewport.getAttribute("style");
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Attack knowledge graph" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Expand", exact: true }),
    ).toBeFocused();
    await expect(viewport).toHaveAttribute("style", prior!);
    const node = page.locator('.react-flow__node[data-id="ac_idor_confirmed"]');
    await node.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("complementary", { name: "Graph inspection" }),
    ).toContainText("ac_idor_confirmed");
    await page.getByRole("button", { name: "Close inspection" }).click();
    await expect(node).toBeFocused();
    await page.getByRole("button", { name: "Legend", exact: true }).click();
    await expect(page.locator(".akg-legend")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".akg-node")
        .first()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.route("**/api/mock/akg", (route) =>
      route.fulfill({
        json: {
          ...fixture,
          assertions: {
            ...fixture.assertions,
            expected_path: ["unauthenticated"],
          },
          seed: { ...fixture.seed, intervalMs: 120 },
        },
      }),
    );
    await page
      .getByRole("button", { name: "Run seeded AKG traversal test" })
      .click();
    await expect(page.getByText("AKG mismatch", { exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await expect(
      page.getByText("Exact ordered traversal", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${captures}/${width}-mismatch.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("viewport, resize, scrolling, edge inspection and reduced motion during replay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/runtime/runs*", (route) =>
    route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }),
  );
  await page.goto("/");
  await revealReplayLauncher(page);
  await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
  const index = async () =>
    Number((await page.getByTestId("replay-count").innerText()).split("/")[0]);
  await expect.poll(index, { intervals: [50] }).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const viewport = page.locator(".react-flow__viewport");
  const transform = await viewport.getAttribute("style");
  await expect.poll(index, { intervals: [50] }).toBeGreaterThanOrEqual(7);
  await expect(viewport).toHaveAttribute("style", transform!);
  expect(
    await page
      .locator('[data-latest="true"]')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");

  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(index, { timeout: 12000 }).toBe(18);
  await page.keyboard.press("Escape");
  await expect(page.getByText("AKG verified", { exact: true })).toBeVisible();
  await expect(viewport).toHaveAttribute("style", transform!);

  // The ledger is the panel's only body, and each panel scrolls on its own.
  for (const panel of ["Coordinate", "Conversation", "Outcomes"]) {
    const scroller = page
      .locator(
        `.runtime-sidebar > section[aria-label="${panel}"] .runtime-panel-body`,
      )
      .first();
    const pageScroll = await page.evaluate(() => window.scrollY);
    expect(
      await scroller.evaluate((element) => {
        element.scrollTop = 150;
        return element.scrollTop;
      }),
    ).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  }

  const oldWidth = (await page.locator(".akg-canvas").boundingBox())!.width;
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => (await page.locator(".akg-canvas").boundingBox())!.width).not.toBe(oldWidth);
  const workspaceWidth = (await page.locator(".runtime-dashboard").boundingBox())!.width;
  expect((await page.locator(".akg-canvas").boundingBox())!.width).toBeGreaterThanOrEqual(workspaceWidth - 4);
  expect(
    (await page.locator(".akg-panel").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(480);
  await expect(viewport).toHaveAttribute("style", transform!);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const canvas = (await page.locator(".akg-canvas").boundingBox())!;
  for (const node of await page.locator(".react-flow__node-card").all()) {
    const box = (await node.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(canvas.x);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  }
  const edge = page.locator(".react-flow__edge").first();
  await edge.focus();
  await page.keyboard.press("Enter");
  const inspection = page.getByRole("complementary", {
    name: "Graph inspection",
  });
  await expect(inspection).toContainText("Source");
  await expect(inspection).toContainText("Preconditions");
  await expect(inspection).toContainText("Target agent");
  await page.getByRole("button", { name: "Close inspection" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("region", { name: "Outcomes", exact: true })
    .scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("conversation ledger projects the replay journal into turns", async ({ page }) => {
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/runtime/runs*", (route) =>
    route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }),
  );
  await page.goto("/");
  await revealReplayLauncher(page);
  await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
  await expect(page.getByText("AKG verified", { exact: true })).toBeVisible({ timeout: 15000 });

  const panel = page.locator('.runtime-sidebar > section[aria-label="Conversation"]');
  expect(await panel.getByRole("group", { name: "Conversation view" }).count()).toBe(0);

  const ledger = panel.locator(".trajectory-ledger");
  await expect(ledger).toBeVisible();
  await expect(ledger.getByRole("heading", { name: "Turn 1", exact: true })).toBeVisible();
  expect(await ledger.locator(".trajectory-turn").count()).toBeGreaterThan(0);

  // Unfiltered and chronological: every collapsed cell is present, from the
  // opening event to the closing one, with no view hidden by default.
  await expect(panel.getByRole("searchbox", { name: "Filter trajectory records" })).toHaveValue("");
  await expect(ledger.locator(".trajectory-cell")).toHaveCount(16);
  await expect(ledger.locator(".trajectory-cell").first()).toContainText("run.started");
  await expect(ledger.locator(".trajectory-cell").last()).toContainText("run.completed");
  await expect(ledger.getByText("Context", { exact: true }).first()).toBeVisible();
  await expect(ledger.getByText("Tool", { exact: true }).first()).toBeVisible();

  // The Conversation filter keeps the model's own exchange and hides the rest.
  const conversationFilter = panel.getByRole("button", {
    name: "Show conversation records only",
  });
  await expect(conversationFilter).toHaveAttribute("aria-pressed", "false");
  await conversationFilter.click();
  await expect(conversationFilter).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".trajectory-timing-meta")).toContainText("3 of 16 records");
  await expect(ledger.locator(".trajectory-cell")).toHaveCount(3);
  await expect(ledger.getByText("Tool", { exact: true })).toHaveCount(0);
  await expect(ledger.getByText("Context", { exact: true })).toHaveCount(0);
  await expect(ledger.getByText("Safety", { exact: true })).toHaveCount(0);
  await panel.screenshot({ path: `${captures}/trajectory-conversation.png` });
  await conversationFilter.click();
  await expect(conversationFilter).toHaveAttribute("aria-pressed", "false");
  await expect(ledger.locator(".trajectory-cell")).toHaveCount(16);

  // The panel body is the only scroll region; the ledger grows inside it.
  const body = panel.locator(".conversation-scroll.is-trajectory");
  expect(await body.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  expect(await ledger.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await panel.screenshot({ path: `${captures}/trajectory-desktop.png` });

  // The timing overview stays folded so the ledger keeps the small panel height.
  const timing = panel.locator("details.trajectory-timing");
  await expect(timing.locator("summary")).toContainText("records");
  await expect(timing).toHaveJSProperty("open", false);
  await expect(timing.locator(".trajectory-lane-track").first()).toBeHidden();
  await timing.locator("summary").click();
  await expect(timing).toHaveJSProperty("open", true);
  await expect(timing.locator(".trajectory-lane-track")).toHaveCount(3);
  await expect(timing.locator(".trajectory-lane-track").first()).toBeVisible();
  await expect(timing.locator("table.trajectory-timing-table tbody tr")).toHaveCount(3);

  // Timeline: one block per record, coloured by kind, with turn separators and
  // a proportional turn strip beneath the lanes.
  await expect(timing.locator(".trajectory-span")).toHaveCount(16);
  await expect(timing.locator('.trajectory-span[data-kind="tool"]').first()).toBeVisible();
  await expect(timing.locator(".trajectory-turn-line")).toHaveCount(2);
  await expect(timing.locator(".trajectory-turn-segment")).toHaveCount(3);
  await expect(timing.locator(".trajectory-axis")).toContainText("observed");

  // The Duration control swaps measured widths for equal-width operations.
  await panel.getByRole("button", { name: "Use equal-width operations" }).click();
  await expect(timing.locator(".trajectory-axis")).toContainText("equal width");
  await expect(
    panel.getByRole("button", { name: "Use actual duration" }),
  ).toHaveAttribute("aria-pressed", "false");
  await panel.getByRole("button", { name: "Use actual duration" }).click();
  await expect(timing.locator(".trajectory-axis")).toContainText("observed");
  await expect(
    timing.getByRole("columnheader", { name: "In/Out/Think" }),
  ).toBeVisible();
  await timing.locator("summary").click();
  await expect(timing.locator(".trajectory-lane-track").first()).toBeHidden();

  const firstTurn = ledger.locator(".trajectory-turn").first();
  await firstTurn.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${captures}/trajectory-ledger.png` });

  // Turn 1 only records the entry state, so its status stays "Observed".
  await expect(firstTurn.locator(".trajectory-turn-meta .trajectory-status")).toHaveText(
    "Observed",
  );

  // The first model turn carries settled node states and the AKG path it followed.
  const modelTurn = ledger.locator(".trajectory-turn").filter({ hasText: "llm.response" });
  await expect(modelTurn.locator(".trajectory-turn-meta .trajectory-status")).toHaveText(
    "Completed",
  );
  await expect(modelTurn.locator(".trajectory-node").first()).toContainText("bf_dictionary");
  await expect(modelTurn.locator(".trajectory-path")).toContainText("unauthenticated");

  const cell = firstTurn.locator(".trajectory-cell-toggle").first();
  await expect(cell).toHaveAttribute("aria-expanded", "false");
  await cell.click();
  await expect(cell).toHaveAttribute("aria-expanded", "true");
  await expect(firstTurn.locator(".trajectory-cell-detail").first()).toBeVisible();

  // The model cell carries the response text and its raw payload separately.
  await modelTurn.getByRole("button", { name: /llm\.response/ }).click();
  const modelCell = modelTurn.locator(".trajectory-cell").filter({ hasText: "llm.response" });
  const modelDetail = modelCell.locator(".trajectory-cell-detail");
  // The per-record inspector labels every timing and token fact it derived.
  const timingRows = modelDetail.locator('dl[aria-label="Record timing"] .trajectory-fact');
  await expect(timingRows).toHaveCount(6);
  await expect(timingRows.locator("dt").last()).toHaveText("Source");
  await expect(timingRows.locator("dd").last()).toHaveText("journal event timestamps");
  const usageRows = modelDetail.locator('dl[aria-label="Token usage"] .trajectory-fact');
  await expect(usageRows).toHaveCount(5);
  await expect(usageRows.locator("dd").last()).toHaveText("18");
  await expect(modelDetail.locator("summary", { hasText: "Thinking" })).toHaveCount(0);
  const block = (label: string) =>
    modelDetail
      .locator("details.trajectory-block")
      .filter({ has: page.getByText(label, { exact: true }) });

  const responseBlock = block("Response");
  await responseBlock.locator("summary").click();
  await expect(responseBlock.locator("pre")).toHaveText(
    "Use the seeded credential pair and verify the login signal.",
  );
  const rawBlock = block("Raw JSON");
  await rawBlock.locator("summary").click();
  await expect(rawBlock.locator("pre")).toContainText("response_text");

  // Turns fold: collapsing every turn hides the ledgers rows, restoring shows them.
  await panel.getByRole("button", { name: "Collapse turns" }).click();
  await expect(panel.getByRole("button", { name: "Expand turns" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(ledger.locator(".trajectory-cells").first()).toBeHidden();
  await expect(ledger.locator(".trajectory-cell").first()).toBeHidden();
  await expect(ledger.getByRole("heading", { name: "Turn 1", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Expand turns" }).click();
  await expect(ledger.locator(".trajectory-cell")).toHaveCount(16);

  // A single turn folds from its own header.
  await ledger.getByRole("button", { name: "Collapse turn 2" }).click();
  await expect(ledger.getByRole("button", { name: "Expand turn 2" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await ledger.getByRole("button", { name: "Expand turn 2" }).click();
  await expect(ledger.locator(".trajectory-cell")).toHaveCount(16);

  await panel.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Collapse all", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await ledger
      .locator(".trajectory-cell-toggle")
      .evaluateAll((elements) =>
        elements.every((element) => element.getAttribute("aria-expanded") === "true"),
      ),
  ).toBe(true);

  await panel.getByRole("searchbox", { name: "Filter trajectory records" }).fill("no-such-record");
  await expect(panel.getByText("No records match “no-such-record”")).toBeVisible();
  await panel.getByRole("searchbox", { name: "Filter trajectory records" }).fill("");
  await expect(ledger).toBeVisible();

  // The stacked mobile layout remounts the panels; the ledger stays the only body.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.locator(".trajectory-ledger")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Turn 1", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const mobileModelTurn = panel.locator(".trajectory-turn").filter({ hasText: "llm.response" });
  await mobileModelTurn.getByRole("button", { name: /llm\.response/ }).click();
  const mobileDetail = mobileModelTurn.locator(".trajectory-cell-detail");
  await mobileDetail
    .locator("details.trajectory-block")
    .filter({ has: page.getByText("Response", { exact: true }) })
    .locator("summary")
    .click();
  await expect(mobileDetail).toContainText("Use the seeded credential pair");
  await mobileDetail.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${captures}/trajectory-mobile.png` });

  // The overview fits the taller stacked panel, so capture lanes and table together.
  const mobileTiming = panel.locator("details.trajectory-timing");
  await mobileTiming.locator("summary").click();
  await expect(mobileTiming.locator("table.trajectory-timing-table tbody tr")).toHaveCount(3);
  await mobileTiming.screenshot({ path: `${captures}/trajectory-timing.png` });
});
