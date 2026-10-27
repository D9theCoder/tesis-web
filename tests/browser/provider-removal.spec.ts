import { expect, test } from "@playwright/test";

const fixture = {
  configPath: "/tmp/fixture/config.yaml", sourceConfigPath: "/tmp/fixture/source.yaml", profileExists: true,
  yaml: "target_url: http://127.0.0.1/dvwa\n", preservedSecretCount: 0,
  fields: [{ path: "target_url", label: "Target URL", category: "target", kind: "text", valueType: "string", value: "http://127.0.0.1/dvwa" }],
  forms: {}, categories: [], modelProfiles: [], resolved: null, resolvedError: null, fieldErrors: {}, warnings: [],
  providers: [{ id: "fixture", displayName: "Fixture provider", protocol: "openai_compatible", baseUrl: "https://example.invalid/v1", fetchUrl: "", models: ["test-model"], keyRef: "${KEY}", hasKey: true }],
  control: { enabled: true, reason: null },
};

for (const width of [1440, 390]) test(`provider removal confirmation and undo at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/control/schema", (route) => route.fulfill({ json: fixture }));
  await page.route("**/api/control/config/save", (route) => route.fulfill({ json: { saved: true, fieldErrors: {} } }));
  await page.route("**/api/control/config/validate", (route) => route.fulfill({ json: { valid: true, fieldErrors: {}, coordinates: [], totalCoordinates: 0, removedProfileReferences: [] } }));
  await page.goto("/settings");
  // Cause a stubbed refresh to replace the server-rendered profile with the fixture.
  const target = page.getByLabel("Target URL", { exact: false });
  await target.fill("http://127.0.0.1/fixture");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByRole("tab", { name: "Model providers" }).click();
  const row = page.locator("li").filter({ has: page.getByRole("heading", { name: "Fixture provider" }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Delete provider" })).toHaveCount(0);
  await row.getByRole("button", { name: "Edit provider" }).click();
  await page.getByRole("button", { name: "Delete provider" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete provider" });
  await expect(dialog).toContainText("API keys stored separately remain and are not revoked");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath(`provider-dialog-${width}.png`), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Delete provider" }).click();
  await dialog.getByRole("button", { name: "Stage provider removal" }).click();
  await expect(row.getByRole("button", { name: "Undo removal" })).toBeVisible();
  await row.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.getByRole("button", { name: "Delete provider" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
