import { expect, test } from "@playwright/test";

test("negative oracle evidence is filterable and linked back to its execution", async ({ page }) => {
  const ref = "#/config/scoring_oracles/0/document/negative_attestations/0";
  await page.route("**/api/results/compat-negative", route => route.fulfill({ json: {
    execution_id: "compat-negative", execution_status: "completed", security_outcome: "no_finding",
    response_evidence: [{ evidence_id: "response:0", agent_id: "bf_dictionary", candidate_id: "candidate",
      signal_detected: false, success: false, negative_oracle_ref: ref, response_excerpt: "Username and/or password incorrect." }],
    config: { scoring_oracles: [{ source_id: "session-negative", origin: "operator_fixture", sha256: "a".repeat(64), document: {
      status: "not_confirmed", negative_attestations: [{ evidence_id: "response:0", candidate_id: "candidate", method: "bf_dictionary", outcome: "not_confirmed" }],
    } }] },
  } }));
  await page.goto("/results/compat-negative?tab=evidence");
  await page.getByRole("combobox", { name: "Phase", exact: true }).selectOption("negative_attestations");
  const rows = page.getByRole("table", { name: "Evidence records" }).locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await rows.getByRole("button", { name: /^Inspect evidence/ }).click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("not_confirmed");
  await detail.getByText("Structured data", { exact: true }).click();
  await expect(detail).toContainText(ref);
  await expect(detail).toContainText("a".repeat(64));
  await detail.getByRole("button", { name: "response:0", exact: true }).click();
  await expect(detail).toContainText("signal: absent");
  await expect(detail).toContainText("Username and/or password incorrect.");
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
});

test("a separately routed chain remains current after an unchanged historical snapshot", async ({ page }) => {
  const run = { executionId: "compat-branch", mode: "single-run", directory: "fixture", status: "running", connection: "active", hasJournal: true, hasArtifact: false };
  const path = ["bf_dictionary", "authenticated_session", "ac_idor"];
  const chain = ["authenticated_session", "ac_force_browse"];
  const events = [
    { event_type: "graph.state", execution_id: run.executionId, data: { akg_path: path } },
    { event_type: "akg.route.selected", execution_id: run.executionId, node: "chaining_router", data: { reason: "chain_ready", chain, target_agent: "ac_force_browse" } },
    { event_type: "graph.state", execution_id: run.executionId, data: { akg_path: path, selected_method: "ac_force_browse" } },
  ];
  await page.route("**/api/runtime/runs**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/events")) return route.fulfill({ json: { executionId: run.executionId,
      events: url.searchParams.get("cursor") === "0" ? events : [], nextCursor: events.length, status: "active", hasMore: false } });
    return route.fulfill({ json: url.pathname.endsWith(run.executionId) ? run : { runs: [run], active: [run], tesisRoot: "fixture" } });
  });
  await page.goto("/?execution=compat-branch");
  const active = page.locator('.react-flow__node[data-id="ac_force_browse"] [data-current="true"]');
  await expect(active).toBeVisible();
  const currentRoute = page.getByRole("list", { name: "Recorded route" }).first();
  await expect(currentRoute).toContainText("ac_force_browse");
  await expect(currentRoute).not.toContainText("ac_idor");
});
