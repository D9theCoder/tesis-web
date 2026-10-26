import { expect, test, type Page } from "@playwright/test";

const seedTheme = (theme: string) => {
  if (!localStorage.getItem("tesis-theme:v1")) localStorage.setItem("tesis-theme:v1", theme);
  sessionStorage.setItem("tesis-boot:v1", "1");
};

/**
 * The theme radios are controlled inputs: a click that lands before hydration
 * is undone by React's first client render. Select until the theme sticks.
 */
async function selectTheme(page: Page, name: string, theme: string) {
  await expect(async () => {
    await page.getByRole("radio", { name }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

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

  await selectTheme(page, "Hacker", "hacker");
  await expect(page.locator(".hacker-cinema")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hacker");
  await expect(page.getByRole("button", { name: "Splash intro animation: off" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Power-down animation: off" })).toHaveAttribute("aria-pressed", "false");

  await selectTheme(page, "Dark", "dark");
  await expect(page.locator(".hacker-cinema")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the experiment mode switch speaks the hacker chip language", async ({ page }) => {
  await page.addInitScript(seedTheme, "hacker");
  await page.goto("/control");

  const modeSwitch = page.getByRole("group", { name: "Experiment mode" });
  const chip = (name: string) => modeSwitch.getByRole("button", { name });
  const read = (locator: typeof modeSwitch) =>
    locator.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        radius: style.borderRadius,
        transform: style.textTransform,
        font: style.fontFamily,
        background: style.backgroundColor,
      };
    });

  // Square frame and a pressed chip filled with the palette accent, matching
  // the rain control rather than the rounded surface used in light and dark.
  expect((await read(modeSwitch)).radius).toBe("2px");
  const selected = await read(chip("Single run"));
  expect(selected.transform).toBe("uppercase");
  expect(selected.font).toMatch(/mono/i);
  expect(selected.background).not.toBe((await read(chip("Matrix"))).background);

  await page.evaluate(() => localStorage.setItem("tesis-theme:v1", "light"));
  await page.reload();
  await expect(page.getByRole("group", { name: "Experiment mode" })).toBeVisible();
  expect((await read(page.getByRole("group", { name: "Experiment mode" }))).radius).toBe("6px");
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
