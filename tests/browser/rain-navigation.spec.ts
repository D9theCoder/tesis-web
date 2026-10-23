import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "no-preference",
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

test("keeps the rain scene across navigation and viewport resizes", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tesis-theme:v1", "hacker");
    sessionStorage.setItem("tesis-boot:v1", "1");
    const sources = new Set<CanvasImageSource>();
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D, image: CanvasImageSource, ...coordinates: number[]
    ) {
      if (this.canvas.classList.contains("hacker-rain")) sources.add(image);
      return Reflect.apply(drawImage, this, [image, ...coordinates]);
    };
    Object.defineProperty(window, "__rainAtlasCount", { get: () => sources.size });
  });
  const atlasCount = () => page.evaluate(() => (
    window as typeof window & { __rainAtlasCount: number }
  ).__rainAtlasCount);

  await page.goto("/settings");
  const canvas = await page.locator(".hacker-rain").elementHandle();
  expect(canvas).not.toBeNull();
  await expect.poll(atlasCount).toBeGreaterThan(0);
  // Let the initial ResizeObserver delivery settle before comparing scenes.
  await page.waitForTimeout(300);
  const initialCount = await atlasCount();
  for (const route of ["/help", "/settings"]) {
    await page.locator(`.app-sidebar .app-navigation a[href="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await page.waitForTimeout(300);
    expect(await atlasCount()).toBe(initialCount);
    expect(await canvas!.evaluate(element => element === document.querySelector(".hacker-rain"))).toBe(true);
  }

  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(300);
  expect(await atlasCount()).toBe(initialCount);
  await expect(page.locator(".hacker-rain")).toHaveJSProperty("width", 1100);
});
