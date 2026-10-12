import { expect, test } from "@playwright/test";
import { AKG_SNAPSHOT } from "@/lib/akg-static";

test("pagination resumes after mock replay cancels a pending page", async ({ page }) => {
  const run = { executionId: "pagination-live", mode: "single-run", directory: "fixture", status: "unknown" };
  const firstPage = { runs: [run], active: [], total: 3, nextCursor: 1, tesisRoot: "fixture" };
  let releaseStale!: () => void;
  let releaseCurrent!: () => void;
  const stale = new Promise<void>(resolve => { releaseStale = resolve; });
  const current = new Promise<void>(resolve => { releaseCurrent = resolve; });
  let olderRequests = 0;
  await page.route("**/api/akg**", route => route.fulfill({ json: AKG_SNAPSHOT }));
  await page.route("**/api/runtime/runs?*", async route => {
    if (new URL(route.request().url()).searchParams.get("cursor") !== "1") {
      await route.fulfill({ json: firstPage });
      return;
    }
    const request = ++olderRequests;
    await (request === 1 ? stale : current);
    await route.fulfill({ json: { ...firstPage, nextCursor: 2,
      runs: [{ ...run, executionId: request === 1 ? "stale-run" : "older-run" }] } }).catch(() => undefined);
  });
  try {
    await page.goto("/");
    const catalog = page.locator("details").filter({ has: page.locator("summary", { hasText: "Run catalog" }) });
    await catalog.locator("summary").click();
    const button = catalog.getByRole("button", { name: "Load older runs" });
    await button.click();
    await expect(button).toBeDisabled();
    await expect.poll(() => olderRequests).toBe(1);
    await page.getByRole("button", { name: "Run seeded AKG traversal test" }).click();
    await page.getByRole("button", { name: "Return to live" }).click();
    await catalog.locator("summary").click();
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => olderRequests).toBe(2);
    releaseStale();
    await expect(button).toBeDisabled();
    await expect(catalog.getByText("stale-run", { exact: true })).toHaveCount(0);
    releaseCurrent();
    await expect(catalog.getByText("older-run", { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
  } finally {
    releaseStale();
    releaseCurrent();
  }
});
