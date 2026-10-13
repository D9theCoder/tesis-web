import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.describe("enterprise observer workspace", () => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires sanitized artifact fixtures");
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`navigation, themes, review and keyboard access at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const captures = ".impeccable/review";
      const device = width > 600 ? "desktop" : "mobile";
      await mkdir(captures, { recursive: true });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const capture = async (label: string) => {
        await page.evaluate(() => { if (!document.querySelector('[role="dialog"]') && document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.screenshot({ path: `${captures}/${device}${label}.png`, fullPage: true });
      };

      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Live monitor", exact: true })).toBeVisible();
      await page.getByText("Demonstration replay", { exact: true }).click();
      await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
      await expect(page.getByText("AKG verified", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.locator(".akg-view")).toHaveAttribute("data-layout-ready", "true");
      await noOverflow();
      await capture("");
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await capture("-dark");
      await page.getByRole("button", { name: "Switch to light theme" }).click();

      for (const [route, heading, label] of [
        ["/results", "Experiment results", "catalog"],
        ["/overview", "Workspace overview", "overview"],
        ["/help", "Observer guide", "guide"],
      ]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        if (route !== "/help") await expect(page.getByRole("table", { name: "Run catalog" })).toBeVisible();
        if (width < 600 && route !== "/help") {
          const rows = page.getByRole("table", { name: "Run catalog" }).locator("tbody tr");
          const firstRow = rows.first();
          await expect(firstRow.locator(".catalog-cell-label", { hasText: "Execution status" })).toBeVisible();
          await expect(firstRow.locator(".catalog-cell-label", { hasText: "Security outcome" })).toBeVisible();
          const cells = firstRow.getByRole("cell");
          for (const index of [3, 4, 6]) {
            expect(await cells.nth(index).evaluate(element => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= 0 && bounds.right <= innerWidth;
            })).toBe(true);
          }
        }
        await noOverflow();
        await capture(`-${label}`);
      }
      await page.goto("/results/browser-matrix");
      await expect(page.getByRole("tab", { name: "Summary", exact: true })).toHaveAttribute("aria-selected", "true");
      await noOverflow();
      await capture("-results");
      await page.getByText("Browse coordinates", { exact: true }).click();
      await page.getByRole("button", { name: /Coordinate 1:/ }).click();
      await expect(page.getByText("execution browser-child-a")).toBeVisible();
      await page.getByRole("tab", { name: "Scoring", exact: true }).click();
      await page.getByRole("button", { name: "AI review", exact: true }).click();
      await expect(page.getByRole("button", { name: "AI review", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("2.5000", { exact: true })).toBeVisible();
      await noOverflow();
      await capture("-scoring");
      await page.getByRole("tab", { name: "Evidence", exact: false }).click();
      await noOverflow();
      const inspect = page.getByRole("button", { name: /^Inspect evidence/ }).first();
      await inspect.click();
      await expect(page.getByRole("dialog", { name: "Evidence detail" })).toBeVisible();
      await noOverflow();
      await capture("-evidence");
      await page.screenshot({ path: `${captures}/${device}-evidence-viewport.png`, fullPage: false });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(inspect).toBeFocused();
      await page.getByRole("tab", { name: "Summary", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: /^Evidence/ })).toHaveAttribute("aria-selected", "true");
      if (width < 600) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        const navigation = page.getByRole("dialog", { name: "TESIS navigation" });
        await expect(navigation).toBeVisible();
        await navigation.getByRole("link", { name: "Results", exact: true }).click();
        await expect(page).toHaveURL(/\/results$/);
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      expect(errors).toEqual([]);
    });
  }
});
