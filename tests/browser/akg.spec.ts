import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const captures = "test-results/acceptance";

test("long labels and unfamiliar nodes remain inspectable without changing topology", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/akg")).json();
  const longLabel = "An unfamiliar method with a deliberately long label that remains available in full through inspection";
  snapshot.nodes.push({ id: "unfamiliar-browser-node", type: "method", kind: "method", label: longLabel });
  await page.route("**/api/akg", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/runtime/runs", (route) => route.fulfill({ json: { runs: [], active: [] } }));
  await page.goto("/");
  const node = page.locator('.react-flow__node[data-id="unfamiliar-browser-node"]');
  await expect(node).toBeAttached();
  await expect(page.getByTestId("node-count")).toHaveText("30/30 nodes");
  await expect(page.locator(".react-flow__edge")).toHaveCount(snapshot.edges.length);
  const label = node.locator(".akg-node-label");
  expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px");
  expect(await label.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(30);
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
    await page.route("**/api/runtime/runs", (route) =>
      route.fulfill({ json: { runs: [], active: [] } }),
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
    await page
      .getByRole("button", { name: "Run seeded AKG traversal test" })
      .click();
    await expect(page.getByTestId("replay-count")).toHaveText(
      "0/18 events reduced",
    );
    await expect(page.getByText("✓ AKG verified", { exact: true })).toHaveCount(
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
    await expect(page.getByText("✓ AKG verified", { exact: true })).toBeVisible(
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
    await expect(page.getByText("✕ AKG mismatch", { exact: true })).toBeVisible(
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
  await page.route("**/api/runtime/runs", (route) =>
    route.fulfill({ json: { runs: [], active: [] } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run seeded AKG traversal test" })
    .click();
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
  await expect(page.getByText("✓ AKG verified", { exact: true })).toBeVisible();
  await expect(viewport).toHaveAttribute("style", transform!);

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  for (const panel of ["Coordinate", "Conversation", "Outcomes"]) {
    const scroller = page
      .locator(
        `.runtime-sidebar > section[aria-label="${panel}"] .overflow-y-auto`,
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
  await expect
    .poll(async () => (await page.locator(".akg-canvas").boundingBox())!.width)
    .toBeGreaterThan(oldWidth);
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
