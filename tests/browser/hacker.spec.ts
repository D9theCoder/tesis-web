import { expect, test } from "@playwright/test";

const seedTheme = (theme: string) => {
  if (!localStorage.getItem("tesis-theme:v1")) localStorage.setItem("tesis-theme:v1", theme);
  sessionStorage.setItem("tesis-boot:v1", "1");
};

test("hacker is opt-in from Settings, persists, and steps out of the header", async ({ page }) => {
  await page.addInitScript(seedTheme, "light");
  await page.goto("/settings");

  const themeGroup = page.getByRole("group", { name: /^Theme:/ });
  await expect(themeGroup).toHaveAccessibleName("Theme: light");
  await expect(page.locator(".app-topbar .theme-toggle")).toBeVisible();

  await page.getByRole("radio", { name: "Hacker" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
  await expect(page.locator(".app-topbar .theme-toggle")).toHaveCount(0);
  await expect(page.locator(".hacker-rain")).toHaveCount(1);
  await expect(page.locator(".hacker-statusbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rain max" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
  await expect(page.locator(".app-topbar .theme-toggle")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Theme: hacker" })).toBeVisible();

  await page.getByRole("radio", { name: "Light" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".app-topbar .theme-toggle")).toBeVisible();
});

test("rain controls are stable, keyboard reachable, and fit at 375px", async ({ page }) => {
  await page.addInitScript(seedTheme, "hacker");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");

  const off = page.getByRole("button", { name: "Rain off" });
  const normal = page.getByRole("button", { name: "Rain normal" });
  const max = page.getByRole("button", { name: "Rain max" });
  const bar = page.locator(".hacker-statusbar");
  const before = (await bar.boundingBox())!;
  const control = (await page.locator(".hacker-rain-control").boundingBox())!;

  await normal.click();
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await expect(normal).toBeFocused();
  expect((await bar.boundingBox())!.height).toBe(before.height);
  expect((await page.locator(".hacker-rain-control").boundingBox())!.width).toBe(control.width);

  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hacker-statusbar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.locator(".app-topbar .theme-toggle")).toHaveCount(0);
  await expect(max).toBeEnabled();
});

test("reduced motion turns rain off and keeps the control honest", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(seedTheme, "hacker");
  await page.goto("/settings");

  const off = page.getByRole("button", { name: "Rain off" });
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Rain normal" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rain max" })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Rain intensity" })).toHaveAccessibleDescription(/static pattern/i);
});
