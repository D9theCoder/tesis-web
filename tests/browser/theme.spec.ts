import { expect, test } from "@playwright/test";

test("theme toggle cross-dissolves without shifting layout or animating every element", async ({ page }) => {
  await page.goto("/help");
  const toggle = page.locator(".topbar-actions button");
  await expect(toggle).toHaveAccessibleName("Theme: light. Switch to dark.");
  const before = (await toggle.boundingBox())!;
  const iconBefore = (await toggle.locator(".theme-toggle-icon").boundingBox())!;

  const observed = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Theme: light. Switch to dark."]');
    if (!button) throw new Error("theme toggle unavailable");
    button.click();
    const animations = (element: Element | null) => (element?.getAnimations() ?? []).map(animation => {
      const cssAnimation = animation as CSSAnimation;
      const transition = animation as CSSTransition;
      return {
        name: cssAnimation.animationName || transition.transitionProperty,
        duration: animation.effect?.getTiming().duration,
      };
    });
    const topbar = document.querySelector(".app-topbar");
    return {
      theme: document.documentElement.dataset.theme,
      target: document.documentElement.dataset.themeIcon,
      transitioning: document.documentElement.classList.contains("theme-fading"),
      scrim: Boolean(document.querySelector(".theme-canvas-fade")),
      oldSurface: getComputedStyle(document.documentElement).getPropertyValue("--theme-old-surface").trim(),
      headerSurface: topbar ? getComputedStyle(topbar, "::before").backgroundColor : null,
      headerOverlay: document.getAnimations()
        .filter(animation => (animation.effect as KeyframeEffect | null)?.pseudoElement === "::before")
        .map(animation => ({
          name: (animation as CSSAnimation).animationName,
          duration: animation.effect?.getTiming().duration,
        })),
      root: animations(document.documentElement),
      sidebar: animations(document.querySelector(".app-sidebar")),
      topbar: animations(topbar),
      headerContent: animations(document.querySelector(".topbar-context")),
      content: animations(document.querySelector(".app-main")),
      icon: animations(document.querySelector(".theme-icon-sun")),
      total: document.getAnimations().length,
    };
  });

  // The theme flips at the hidden midpoint, not before the fade starts.
  expect(observed.theme).toBe("light");
  expect(observed.target).toBe("dark");
  expect(observed.transitioning).toBe(true);
  expect(observed.scrim).toBe(true);
  expect(observed.root).toEqual([]);
  expect(observed.content).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "theme-content-dip", duration: 320 }),
  ]));
  // The sticky header stays opaque: its old surface fades over a pseudo-element
  // while its contents dip. It must not run a background transition that turns
  // light text on a still-white bar, and it must not fade the bar itself.
  expect(observed.topbar).toEqual([]);
  expect(observed.oldSurface).toBe("rgb(255 255 255)");
  expect(observed.headerSurface).toBe("rgb(255, 255, 255)");
  expect(observed.headerOverlay).toEqual([
    expect.objectContaining({ name: "theme-header-fade", duration: 320 }),
  ]);
  expect(observed.headerContent).toEqual([
    expect.objectContaining({ name: "theme-content-dip", duration: 320 }),
  ]);
  expect(observed.sidebar).toEqual([
    expect.objectContaining({ name: "theme-content-dip", duration: 320 }),
  ]);
  expect(observed.icon).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "opacity", duration: 320 }),
    expect.objectContaining({ name: "transform", duration: 320 }),
  ]));
  // A performance guard: four dips, two fades for the canvas and header, and
  // six glyph transitions (three icons × opacity/transform) — never one per element.
  expect(observed.total).toBeLessThan(16);

  const dip = await page.evaluate(() => {
    const targets = [".app-main", ".topbar-context", ".topbar-actions"];
    for (const selector of targets) {
      const element = document.querySelector(selector);
      for (const animation of element?.getAnimations() ?? []) animation.currentTime = 160;
    }
    const headerFade = document.getAnimations().find(animation => (animation.effect as KeyframeEffect | null)?.pseudoElement === "::before");
    if (headerFade) headerFade.currentTime = 160;
    const topbar = document.querySelector(".app-topbar")!;
    return {
      content: targets.map(selector => parseFloat(getComputedStyle(document.querySelector(selector)!).opacity)),
      headerOpacity: parseFloat(getComputedStyle(topbar).opacity),
      headerSurfaceOpacity: parseFloat(getComputedStyle(topbar, "::before").opacity),
    };
  });
  for (const opacity of dip.content) expect(opacity).toBeLessThan(0.5);
  expect(dip.headerOpacity).toBe(1);
  expect(dip.headerSurfaceOpacity).toBeGreaterThan(0);
  expect(dip.headerSurfaceOpacity).toBeLessThan(1);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveClass(/theme-fading/);
  await expect(page.locator(".theme-canvas-fade")).toHaveCount(0);
  expect(await page.evaluate(() => ({
    oldSurface: getComputedStyle(document.documentElement).getPropertyValue("--theme-old-surface").trim(),
    headerOverlay: getComputedStyle(document.querySelector(".app-topbar")!, "::before").content,
    headerOpacity: getComputedStyle(document.querySelector(".app-topbar")!).opacity,
  }))).toEqual({ oldSurface: "", headerOverlay: "none", headerOpacity: "1" });
  const after = (await toggle.boundingBox())!;
  const iconAfter = (await toggle.locator(".theme-toggle-icon").boundingBox())!;
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(iconAfter.width).toBe(iconBefore.width);
  expect(iconAfter.height).toBe(iconBefore.height);
  expect(await page.evaluate(() => localStorage.getItem("tesis-theme:v1"))).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(15, 23, 37)");
});

test("reduced motion switches theme without arming the cross-dissolve", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/help");
  const toggle = page.locator(".topbar-actions button");
  await expect(toggle).toHaveAccessibleName("Theme: light. Switch to dark.");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveClass(/theme-fading/);
  await expect(page.locator(".theme-canvas-fade")).toHaveCount(0);
});
