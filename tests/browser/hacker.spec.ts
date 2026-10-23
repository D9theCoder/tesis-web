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

  // click (not check): the radio reports checked once the power-down commits
  // at its fully black frame, which is the documented hacker-exit behavior.
  await page.getByRole("radio", { name: "Light" }).click({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 2500 });
  await expect(page.locator(".hacker-cinema")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
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

test("the session splash plays when hacker is selected and any key skips it", async ({ page }) => {
  await page.addInitScript(seedTheme, "light");
  await page.goto("/settings");

  await page.getByRole("radio", { name: "Hacker" }).check({ force: true });
  const splash = page.locator('.hacker-cinema[data-kind="splash"]');
  await expect(splash).toBeVisible();
  await expect(splash).toHaveAttribute("data-phase", /sweep|reel|slam|welcome/);
  await expect(splash).toContainText("Hacker mode enabled.");
  // The rain is held under the overlay until the splash reaches its final frame.
  await expect(page.locator("html")).toHaveAttribute("data-cinema-rain", "hold");

  await page.keyboard.press("Escape");
  await expect(splash).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
  await expect(page.locator("html")).not.toHaveAttribute("data-cinema-rain", /.+/);
});

test("the CRT power-down plays when hacker is left and lands on the target theme", async ({ page }) => {
  await page.addInitScript(seedTheme, "hacker");
  await page.goto("/settings");

  // click (not check): the radio reports checked only once the run commits at
  // its fully black frame, which is the documented power-down behavior.
  await page.getByRole("radio", { name: "Light" }).click({ force: true });
  const powerDown = page.locator('.hacker-cinema[data-kind="power-down"]');
  await expect(powerDown).toBeVisible();
  await expect(page.getByRole("button", { name: "Power-down animation: on" })).toHaveAttribute("aria-pressed", "true");

  // The hacker palette holds until the collapse reaches full black.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 2500 });
  await expect(powerDown).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(page.locator(".app-topbar .theme-toggle")).toBeVisible();
});

test("turning both cinematics off makes theme changes plain again", async ({ page }) => {
  await page.addInitScript(seedTheme, "light");
  await page.addInitScript(() => {
    localStorage.setItem("tesis-hacker-splash:v1", "off");
    localStorage.setItem("tesis-hacker-powerdown:v1", "off");
  });
  await page.goto("/settings");

  await page.getByRole("radio", { name: "Hacker" }).check({ force: true });
  await expect(page.locator(".hacker-cinema")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
  await expect(page.getByRole("button", { name: "Splash intro animation: off" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Power-down animation: off" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("radio", { name: "Dark" }).check({ force: true });
  await expect(page.locator(".hacker-cinema")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("reduced motion replaces both cinematics with static acknowledgement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(seedTheme, "light");
  await page.goto("/settings");

  await page.getByRole("radio", { name: "Hacker" }).click({ force: true });
  const splash = page.locator('.hacker-cinema[data-kind="splash"]');
  await expect(splash).toBeVisible();
  await expect(page.locator(".hacker-cinema-reduced-title")).toHaveText("HACKER MODE ENABLED");
  await expect(splash.locator(".hacker-cinema-canvas")).toHaveCount(0);
  await expect(splash).toHaveCount(0, { timeout: 1500 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");

  await page.getByRole("radio", { name: "Light" }).click({ force: true });
  const powerDown = page.locator('.hacker-cinema[data-kind="power-down"]');
  await expect(powerDown).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(powerDown).toHaveCount(0, { timeout: 1500 });
});
