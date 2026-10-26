import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("reasoning stages catalog values and confirms an unknown-model support check", async ({ page }, testInfo) => {
  // Browser interactions use an offline catalog and a stubbed probe. No
  // provider, authentication, experiment, or profile save is invoked here.
  const targets = [
    { id: "fixture-gpt", label: "GPT fixture", model: "gpt-fixture", effort: "low", efforts: ["low", "high", "xhigh"], supported: true },
    { id: "fixture-unknown", label: "Unknown fixture", model: "unknown-fixture", effort: null, efforts: null, supported: true },
    { id: "__evaluator__", label: "AI scorer / GPT fixture", model: "gpt-fixture", effort: null, efforts: ["low", "high"], supported: true },
  ];
  const actions: string[] = [];
  await page.route("**/api/control/config/reasoning", async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body.action);
    await route.fulfill({ json: body.action === "describe"
      ? { targets, fallbackEfforts: ["off", "low", "medium", "high", "xhigh", "max"] }
      : { accepted: true, overrides: { "scoring_evaluator.reasoning_effort": body.effort } } });
  });
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Reasoning", exact: true }).click();
  const effort = page.getByRole("combobox", { name: "Reasoning effort", exact: true });
  await expect(effort).toHaveValue("low");
  await page.screenshot({ path: testInfo.outputPath("reasoning-desktop.png"), fullPage: true, animations: "disabled" });
  await effort.selectOption("high");
  await page.getByRole("button", { name: "Apply effort", exact: true }).click();
  await expect(page.getByText("Reasoning effort staged. Save the profile to use it in new runs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save profile", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Model to configure", exact: true }).selectOption("fixture-unknown");
  await expect(page.getByText(/Unknown model, please set your own/)).toBeVisible();
  await effort.selectOption("custom");
  await page.getByRole("textbox", { name: "Custom effort", exact: true }).fill("adaptive");
  await expect(page.getByRole("button", { name: "Apply effort", exact: true })).toBeDisabled();
  const checksBefore = actions.filter((action) => action === "check").length;
  await page.getByRole("button", { name: "Check reasoning support", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Check reasoning support" });
  await expect(dialog).toContainText("may spend provider credits");
  expect(actions.filter((action) => action === "check")).toHaveLength(checksBefore);
  await dialog.getByRole("button", { name: "Run support check", exact: true }).click();
  await expect(page.getByText(/Provider accepted the effort/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply effort", exact: true })).toBeEnabled();
  await effort.selectOption("high");
  await expect(page.getByRole("button", { name: "Apply effort", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Model to configure", exact: true }).selectOption("__evaluator__");
  await expect(effort).toHaveValue("inherit");
  await expect(effort.getByRole("option", { name: "Inherit model profile" })).toBeAttached();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("reasoning-mobile.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
