import { expect, test } from "@playwright/test";
test.describe("saved artifact retrieval", () => {
  test.skip(!process.env.TESIS_WEB_BROWSER_FIXTURES, "Requires the prepared /tmp observer fixtures and configured local server");
  test("exact IDs, coverage, redaction, independent reviews and snapshot ownership", async ({ request }) => {
    const first = await (await request.get("/api/runtime/runs?limit=2")).json();
    expect(first.total).toBe(4); expect(first.runs).toHaveLength(2); expect(first.nextCursor).toBe(2);
    const second = await (await request.get(`/api/runtime/runs?limit=2&cursor=${first.nextCursor}`)).json();
    expect(new Set([...first.runs,...second.runs].map(r=>r.executionId)).size).toBe(4);
    const parent = await (await request.get("/api/results/browser-matrix")).json();
    expect(parent.schema_version).toBe("observer-result.v1"); expect(JSON.stringify(parent)).not.toContain("Saved response");
    const a = await (await request.get("/api/results/browser-matrix/coordinates/browser-child-a")).json();
    expect(a.artifact.execution_id).toBe("browser-child-a"); expect(a.reviews.ai.SrunFinal).toBe(2.3); expect(a.reviews.human.status).toBe("pending");
    expect(JSON.stringify(a)).not.toContain("fixture-secret-value");
    expect((await request.get("/api/results/browser-matrix/coordinates/intentionally-shared-run-id")).status()).toBe(404);
    const b = await (await request.get("/api/results/browser-child-b")).json();
    expect(b.artifact.execution_status).toBe("failed"); expect(b.artifact.security_outcome).toBe("confirmed");
    const aSnapshot = await (await request.get("/api/akg?executionId=browser-child-a")).json();
    const bSnapshot = await (await request.get("/api/akg?executionId=browser-child-b")).json();
    expect(aSnapshot.ownerExecutionId).toBe("browser-matrix"); expect(bSnapshot.ownerExecutionId).toBe("browser-child-b"); expect(aSnapshot.sha256).not.toBe(bSnapshot.sha256);
    const events = await (await request.get("/api/runtime/runs/browser-child-a/events?cursor=0")).json();
    expect(events.events).toHaveLength(2); expect(events.nextCursor).toBeGreaterThan(0);
  });
  test("rapid selection retains one child's header, evidence, reviews and JSON download", async ({ page, request }) => {
    const errors: string[] = []; page.on("pageerror",error=>errors.push(error.message));
    const a = await (await request.get("/api/results/browser-matrix/coordinates/browser-child-a")).json();
    await page.route("**/api/results/browser-matrix/coordinates/browser-child-a",async route => {
      await new Promise(resolve=>setTimeout(resolve,700)); await route.fulfill({ json:a }).catch(()=>undefined);
    });
    await page.goto("/results/browser-matrix");
    await expect(page.getByText("Represented/collected: 3")).toBeVisible(); await expect(page.getByText("Unstarted: 1")).toBeVisible();
    await page.getByRole("button",{ name:/Coordinate 1:/ }).click(); await page.getByRole("button",{ name:/Coordinate 2:/ }).click();
    await expect(page.getByText("execution browser-child-b")).toBeVisible();
    await expect(page.getByText("Security outcome: confirmed",{ exact:true })).toBeVisible();
    await page.waitForTimeout(800); await expect(page.getByText("execution browser-child-b")).toBeVisible();
    await page.getByRole("button",{ name:"JSON",exact:true }).click(); await page.getByRole("button",{ name:"Raw",exact:true }).click();
    await expect(page.locator("pre").first()).toContainText("Saved response b"); await expect(page.locator("pre").first()).not.toContainText("Saved response a");
    const download = page.waitForEvent("download"); await page.getByRole("button",{ name:"JSON",exact:true }).last().click();
    expect((await download).suggestedFilename()).toBe("browser-child-b.redacted.json"); expect(errors).toEqual([]);
  });
  test("score origins, evidence links, filters and responsive selection", async ({ page }) => {
    await page.setViewportSize({ width:390,height:844 });
    await page.goto("/results/browser-matrix");
    await page.getByRole("combobox",{ name:"Filter security outcome" }).selectOption("no_finding");
    await expect(page.getByRole("button",{ name:/Coordinate 2:/ })).toHaveCount(0);
    await page.getByRole("button",{ name:/Coordinate 1:/ }).click(); await expect(page.getByText("execution browser-child-a")).toBeVisible();
    await page.getByRole("button",{ name:"Scoring",exact:true }).click();
    await page.getByRole("button",{ name:"AI review",exact:true }).click();
    await expect(page.getByText("scoring.v4 · final",{ exact:true })).toBeVisible(); await expect(page.getByText("2.5000",{ exact:true })).toBeVisible();
    // Evidence references are visible at desktop width.
    await page.setViewportSize({ width:1440,height:900 });
    await page.getByRole("button",{ name:"#/response_evidence/0",exact:true }).last().click();
    await expect(page.getByRole("dialog")).toContainText("Saved response a"); await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button",{ name:"#/response_evidence/0",exact:true }).last()).toBeFocused();
    await page.getByRole("button",{ name:"Human review",exact:true }).click();
    await expect(page.getByText("pending_candidate_grades",{ exact:true })).toBeVisible();
    await page.setViewportSize({ width:390,height:844 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:"test-results/acceptance/artifacts-mobile.png",fullPage:true });
  });
});
