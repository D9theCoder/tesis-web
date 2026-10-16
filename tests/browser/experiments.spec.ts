import { expect, test } from "@playwright/test";

test.describe("distinct Overview and Results workflows", () => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires sanitized saved artifact sources");

  test("groups experiments, drills into independent outcomes and preserves investigation history", async ({ page }) => {
    await page.goto("/overview?scope=browser-matrix");
    await expect(page.locator(".research-conclusion")).toContainText("3 represented coordinates; 1 attributed confirmed");
    await expect(page.getByRole("table")).toHaveCount(0);
    const coverage = page.getByRole("heading", { name: "Coverage", exact: true }).locator("..").locator("..");
    await expect(coverage.getByText("Recorded planned").locator("..")).toContainText("4");
    const reviews = page.locator(".review-readiness");
    await expect(reviews.getByRole("heading", { name: "Human workflow" }).locator("..").getByText("pending", { exact: true }).locator("..")).toContainText("1");
    await expect(reviews.getByRole("heading", { name: "AI workflow" }).locator("..").getByText("final", { exact: true }).locator("..")).toContainText("1");
    await page.getByRole("link", { name: "confirmed", exact: true }).click();
    await expect(page).toHaveURL(/scope=browser-matrix/);
    await expect(page).toHaveURL(/outcome=confirmed/);
    const inventory = page.getByRole("table");
    await expect(inventory.locator("tbody tr")).toHaveCount(1);
    await expect(inventory).toContainText("browser-child-b");
    await expect(inventory).toContainText("1 failed");
    await inventory.getByRole("link", { name: "Open results", exact: true }).click();
    await expect(page.getByText("execution browser-child-b", { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Security outcome", exact: true })).toHaveValue("confirmed");
    await page.reload();
    await expect(page.getByRole("table")).toContainText("browser-child-b");
    await page.goto("/results?q=browser-&view=experiments");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("table")).toContainText("browser-matrix");
    await page.getByRole("link", { name: /^All executions/ }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
    await page.goBack();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
  });

  test("coordinate, tab and score origin survive direct links, reload and Back", async ({ page }) => {
    await page.goto("/results/browser-matrix?coordinate=browser-child-a&tab=scoring&origin=ai");
    await expect(page.getByRole("button", { name: "AI review", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("execution browser-child-a", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(page).toHaveURL(/tab=json/);
    await page.goBack();
    await expect(page.getByRole("tab", { name: "Scoring", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "AI review", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/results/browser-matrix?coordinate=not-a-member&tab=json");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("No other source is shown");
    await expect(page.locator("pre")).toHaveCount(0);
  });

  test("explicit unavailable scopes never substitute an experiment", async ({ page }) => {
    await page.goto("/overview?scope=missing-source");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("No other experiment has been substituted");
    await expect(page.locator(".research-conclusion")).toHaveCount(0);
    await page.goto("/results?scope=missing-source");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Selected experiment unavailable");
    await expect(page.getByRole("table")).toHaveCount(0);
  });
  test("changing a filter or inventory level cannot drop an explicit scope from an invalid query", async ({ page }) => {
    await page.goto("/results?scope=missing-source&sort=unsupported");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Invalid experiment query");
    await page.getByRole("combobox", { name: "Security outcome", exact: true }).selectOption("confirmed");
    await expect(page).toHaveURL(/scope=missing-source/);
    await expect(page).toHaveURL(/sort=unsupported/);
    await page.getByRole("link", { name: /^All executions/ }).click();
    await expect(page).toHaveURL(/scope=missing-source/);
    await page.getByText("Filters and display", { exact: true }).click();
    await page.getByRole("combobox", { name: "Sort experiments" }).selectOption("newest");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Selected experiment unavailable");
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("newer scope response wins during rapid selection", async ({ page, request }) => {
    const data = await (await request.get("/api/experiments/overview?scope=browser-matrix")).json();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/experiments/overview?scope=browser-matrix", async route => { await gate; await route.fulfill({ json: data }).catch(() => {}); });
    await page.goto("/overview?scope=browser-matrix");
    const selector = page.getByRole("combobox", { name: "Selected experiment" });
    await expect(selector.locator('option[value="overview-standalone"]')).toHaveCount(1);
    await selector.selectOption("overview-standalone");
    await expect(page.locator(".research-conclusion")).toContainText("Standalone outcome: unknown / unattributed");
    release();
    await expect(page.locator(".scope-context")).toContainText("overview-standalone");
    await expect(page.locator(".scope-context")).not.toContainText("browser-matrix");
  });

  test("loading, retrieval error and empty success remain distinct", async ({ page, request }) => {
    const empty = await (await request.get("/api/experiments/overview?scope=browser-matrix")).json();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/experiments/overview?*", async route => { await gate; await route.fulfill({ status: 503, json: { error: "Source temporarily unavailable" } }); });
    await page.goto("/overview");
    await expect(page.getByRole("status", { name: "Loading experiment summary" })).toBeVisible();
    release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Source temporarily unavailable");
    await page.unroute("**/api/experiments/overview?*");
    await page.route("**/api/experiments/overview?*", route => route.fulfill({ json: { ...empty, experiment: null, source: null, attention: [] } }));
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No experiments available" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
});
