import { expect, test, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.describe("dashboard polish", () => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires sanitized artifact fixtures");
  const captures = ".impeccable/polish-2026-10-13";

  for (const width of [320, 768]) {
    test(`graph, icon controls and long evidence at ${width}px`, async ({ page }) => {
      await mkdir(captures, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const capture = async (label: string, fullPage = true) => {
        await page.evaluate(() => {
          if (!document.querySelector('[role="dialog"]') && document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.screenshot({ path: `${captures}/after-${width}-${label}.png`, fullPage });
      };
      const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const [route, label] of [["/results", "catalog"], ["/overview", "overview"], ["/help", "guide"]]) {
        await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        if (route !== "/help") await expect(page.getByRole("table", { name: "Run catalog" })).toBeVisible();
        await noOverflow();
        await capture(label);
      }

      await page.goto("/");
      await page.getByText("Demonstration replay", { exact: true }).click();
      await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
      await expect(page.getByText("AKG verified", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.locator(".akg-view")).toHaveAttribute("data-layout-ready", "true");
      await noOverflow();
      expect((await page.locator(".akg-canvas").boundingBox())!.height).toBeGreaterThanOrEqual(300);
      expect((await page.locator(".akg-canvas .react-flow").boundingBox())!.height).toBeGreaterThanOrEqual(300);
      if (width < 600) {
        for (const name of ["Switch to dark theme", "Zoom in", "Zoom out"]) {
          const bounds = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
        }
      }
      await capture("monitor");
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await page.locator(".react-flow__attribution").evaluate(element => getComputedStyle(element).backgroundColor))
        .toBe(await page.locator(".akg-canvas .react-flow").evaluate(element => getComputedStyle(element).backgroundColor));
      await capture("dark");
      await page.getByRole("button", { name: "Expand", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Attack knowledge graph" })).toBeVisible();
      await noOverflow();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Expand", exact: true })).toBeFocused();

      await page.goto("/results/browser-matrix");
      await expect(page.getByRole("tab", { name: "Summary", exact: true })).toHaveAttribute("aria-selected", "true");
      await capture("results");
      await page.getByText("Browse coordinates", { exact: true }).click();
      await page.getByRole("button", { name: /Coordinate 1:/ }).click();
      await expect(page.getByText("execution browser-child-a")).toBeVisible();
      await page.getByRole("tab", { name: "Scoring", exact: true }).click();
      await noOverflow();
      await capture("scoring");
      await page.getByRole("tab", { name: /^Evidence/ }).click();
      const inspect = page.getByRole("button", { name: /^Inspect evidence/ }).first();
      await inspect.click();
      const dialog = page.getByRole("dialog", { name: "Evidence detail" });
      await expect(dialog).toBeVisible();
      await dialog.getByText("Structured data", { exact: true }).click();
      await noOverflow();
      const header = page.locator(".ui-drawer-header");
      const before = (await header.boundingBox())!;
      await page.locator(".ui-drawer-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
      expect((await header.boundingBox())!.height).toBe(before.height);
      if (width < 600) {
        const close = (await dialog.getByRole("button", { name: "Close", exact: true }).boundingBox())!;
        expect(close.width).toBeGreaterThanOrEqual(44);
        expect(close.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator(".ui-drawer-body").evaluate(element => { element.scrollTop = 0; });
      await capture("drawer", false);
      await page.keyboard.press("Escape");
      await expect(inspect).toBeFocused();
    });
  }

  test("loading, source failure and a successful empty catalog remain distinct", async ({ page }) => {
    await mkdir(captures, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    let pending: Route | undefined;
    await page.route("**/api/runtime/runs*", route => { pending = route; });
    await page.goto("/overview");
    await expect(page.getByRole("status", { name: "Loading run catalog" })).toBeVisible();
    await page.screenshot({ path: `${captures}/after-loading.png`, fullPage: true });
    await pending!.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Source temporarily unavailable" }) });
    await expect(page.getByRole("heading", { name: "Run catalog unavailable" })).toBeVisible();
    await expect(page.getByText("No runs available", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${captures}/after-error.png`, fullPage: true });
    await page.unroute("**/api/runtime/runs*");
    await page.route("**/api/runtime/runs*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tesisRoot: "/sanitized", runs: [], total: 0, nextCursor: null }) }));
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("No runs available", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: `${captures}/after-empty.png`, fullPage: true });
  });
});
