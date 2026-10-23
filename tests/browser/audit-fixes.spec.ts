import { expect, test } from "@playwright/test";

test.describe("technical audit regressions", () => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires sanitized artifact fixtures");
  test.use({ hasTouch: true });

  for (const width of [320, 768]) {
    test(`contrast, semantics, copy identity and touch controls at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async () => {} },
      }));
      await page.goto("/help");
      const proseLink = page.locator('main a[href="/"]').last();
      expect(await proseLink.evaluate(el => getComputedStyle(el).textDecorationLine)).toContain("underline");

      await page.goto("/results");
      await expect(page.getByRole("table")).toBeVisible();
      const input = page.getByRole("searchbox");
      for (const theme of ["light", "dark"]) {
        if (theme === "dark") await page.getByRole("button", { name: "Theme: light. Switch to dark." }).click();
        await expect(page.locator("html")).not.toHaveClass(/theme-fading/);
        const contrast = await input.evaluate(el => {
          const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
            .map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
          const style = getComputedStyle(el), a = luminance(style.borderColor), b = luminance(style.backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(3);
      }
      for (const control of [input, page.getByRole("button", { name: "Theme: dark. Switch to light." }), page.getByRole("link", { name: "Open results", exact: true }).first()]) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }

      await page.goto("/");
      await page.getByText("Demonstration replay", { exact: true }).click();
      await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
      await expect(page.getByText("AKG verified", { exact: true })).toBeVisible({ timeout: 15000 });
      const step = (await page.getByRole("button", { name: /^Step 1:/ }).boundingBox())!;
      expect(step.height).toBeGreaterThanOrEqual(44);

      await page.goto("/results/browser-matrix");
      const copy = page.getByRole("button", { name: "Copy execution ID", exact: true });
      await copy.click();
      await expect(copy).toHaveText("Copied");
      await page.getByText("Browse coordinates", { exact: true }).click();
      await page.getByRole("button", { name: /Coordinate 1:/ }).click();
      await expect(page.getByText("execution browser-child-a", { exact: true })).toBeVisible();
      await expect(copy).toHaveText("Copy");
      await page.getByRole("tab", { name: "Scoring", exact: true }).click();
      await expect(page.locator(".metric-readings")).toBeVisible();
      expect(await page.locator(".metric-readings dl > div > p").count()).toBe(0);
      await expect(page.locator(".metric-readings dd p").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("saved dark theme is applied while all client bundles are pending", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tesis-theme:v1", "dark"));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/_next/**/*.js", async route => { await gate; await route.continue(); });
    try {
      await page.goto("/help", { waitUntil: "commit" });
      await expect(page.getByRole("heading", { name: "Observer guide" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(15, 23, 37)");
    } finally { release(); }
    await expect(page.getByRole("button", { name: "Theme: dark. Switch to light." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("a real layout worker runs, and a failed worker can be retried", async ({ page }) => {
    // Hold one graph identity: runtime adoption must not replace the failed layout before Retry.
    await page.route("**/api/runtime/runs?*", route => route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }));
    const workers: string[] = [];
    page.on("worker", worker => workers.push(worker.url()));
    await page.goto("/");
    await expect(page.locator('.akg-view[data-layout-ready="true"]')).toBeVisible();
    expect(workers.length).toBeGreaterThan(0);
    const workerURL = workers[0];
    await page.route(workerURL, route => route.abort());
    await page.reload();
    await expect(page.locator(".akg-layout-message[role=alert]")).toContainText("worker failed", { timeout: 15000 });
    await page.unroute(workerURL);
    await page.getByRole("button", { name: "Retry layout", exact: true }).click();
    await expect(page.locator('.akg-view[data-layout-ready="true"]')).toBeVisible();
    await expect(page.locator(".akg-node").first()).toBeVisible();
  });
});
