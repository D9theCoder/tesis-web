import { expect, test } from "@playwright/test";

test("focus without a traversal explains its state and offers recovery", async ({ page }) => {
  await page.route("**/api/runtime/runs?*", route => route.fulfill({ json: { runs: [], active: [], tesisRoot: "fixture" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Focus path", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "No traversal" })).toBeVisible();
  await page.getByRole("button", { name: "Return to full graph" }).click();
  await expect(page.getByRole("button", { name: "Full graph", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("final review metrics retain origin, zero and unavailable reasons", async ({ page }) => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires sanitized artifact fixtures");
  await page.goto("/results/browser-child-a");
  await page.getByRole("tab", { name: "Scoring", exact: true }).click();
  await page.getByRole("button", { name: "AI review", exact: true }).click();
  const metrics = page.getByRole("region", { name: "AI review metrics" });
  await expect(metrics.getByText("no_preregistered_optimal_method_ranking")).toBeVisible();
  await expect(metrics.locator("dl > div").filter({ hasText: "Full Exploit Rate" })).toContainText("0");
  await expect(metrics.locator("dl > div").filter({ hasText: "Returned Llm Outputs" })).toContainText("4");
  await page.getByRole("button", { name: "Human review", exact: true }).click();
  await expect(page.getByRole("region", { name: "Human review metrics" })).toContainText("No metric vector");
  await expect(page.getByRole("region", { name: "AI review metrics" })).toHaveCount(0);
});
