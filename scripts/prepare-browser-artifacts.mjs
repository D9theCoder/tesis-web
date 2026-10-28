/** Prepare deterministic, sanitized observer sources. Writes only beneath /tmp. */
import { mkdir, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve(process.argv[2] || "/tmp/tesis-web-browser-artifacts");
if (!root.startsWith("/tmp/tesis-web-")) throw new Error("Fixture output must be /tmp/tesis-web-*");
await mkdir(root, { recursive: true });
if (!(await realpath(root)).startsWith("/tmp/tesis-web-")) throw new Error("Fixture directory cannot escape /tmp through symlinks");
const config = { rubric_version: "scoring.v4", scoring_mode: "both", provider: "fixture", model: "fixture-model" };
const children = ["a","b","c"].map((name,i) => ({
  schema_version: "tui.v1", execution_id: `browser-child-${name}`, run_id: "intentionally-shared-run-id", config,
  status: ["success","error","cancelled"][i], execution_status: ["completed","failed","interrupted"][i],
  security_outcome: ["no_finding","confirmed","unconfirmed"][i], repeat_index: i,
  selected_method: "fixture-method", surface: "fixture", security_level: "low", payload_mode: ["hybrid", "llm_template", "static_only"][i],
  timing: { started_at: "2026-10-12T00:00:00Z", ended_at: "2026-10-12T00:00:10Z", duration_ms: 10000 },
  method_score: 2.75, output_score: 0,
  response_evidence: [{ evidence_id: `response-${name}`, request_id: `request-${name}`, timestamp: "2026-10-12T00:00:05Z", response_excerpt: `Saved response ${name}`,
    signal_detected: name === "b", transport_ok: true, status_code: 200 }],
  request_evidence: [{ request_id: `request-${name}`, timestamp: "2026-10-12T00:00:04Z", endpoint: "https://example.invalid/fixture", headers: { Authorization: "Bearer fixture-secret-value" } }],
  security_outcome_reason: { code: `FIXTURE_${name.toUpperCase()}`, detail: "Saved fixture proof decision", evidence_refs: ["#/response_evidence/0"] },
  confirmed_vulns: name === "b" ? ["fixture-finding"] : [],
}));
async function write(relative,value) {
  const file = path.join(root,relative); await mkdir(path.dirname(file), { recursive: true });
  const parent = await realpath(path.dirname(file)); if (!parent.startsWith(root)) throw new Error("Fixture reference escaped root");
  const bytes = JSON.stringify(value,null,2)+"\n"; await writeFile(file,bytes);
  return { file, hash: createHash("sha256").update(bytes).digest("hex") };
}
const sources = [];
for (const child of children) sources.push(await write(`${child.execution_id}/${child.execution_id}.json`,child));
await write("browser-matrix.matrix.json",{ schema_version: "stage8.v1", execution_id: "browser-matrix", status: "success", execution_status: "completed", matrix: true, runs: children,
  cancellation: { total_runs: 4, not_started_runs: 1, completed_runs: 3 }, totals: { total_runs: 3, completed_runs: 1, error_runs: 1, cancelled_runs: 1, skipped_runs: 0,
    execution_unknown_runs: 0, confirmed_runs: 1, execution_status_counts: { completed: 1, failed: 1, interrupted: 1 }, security_outcome_counts: { confirmed: 1, no_finding: 1, unconfirmed: 1, fixture_limited: 0 } },
});
await write("experiment.manifest.json",{ schema_version: "artifact-manifest.v1", artifact_type: "experiment_manifest", mode: "matrix", aggregate: { execution_id: "browser-matrix", artifact: "browser-matrix.matrix.json" },
  runs: children.map((child,index) => ({ execution_id: child.execution_id, artifact: `${child.execution_id}/${child.execution_id}.json`, index: index+1, repeat_index: index })) });
const snapshot = { schema_version: "akg-snapshot.v1", nodes: [{ id: "fixture-root", type: "entry", kind: "entry", surface: null }], edges: [] };
await write("akg.snapshot.json",snapshot);
await write("browser-child-b/akg.snapshot.json",{ ...snapshot,nodes: [{ id: "fixture-child-b",type:"method",kind:"method",surface:null }] });
const lines = [
  { event_type: "matrix.started", execution_id: "browser-matrix", timestamp: 1791763200 },
  { event_type: "graph.state", execution_id: "browser-child-a", timestamp: 1791763202, data: { akg_path: ["fixture-root"] } },
  { event_type: "matrix.run.finished", execution_id: "browser-matrix", timestamp: 1791763204, data: { coordinate_execution_id: "browser-child-a", execution_status: "completed", security_outcome: "no_finding" } },
  { event_type: "matrix.finished", execution_id: "browser-matrix", timestamp: 1791763210, data: { execution_status: "completed" } },
].map(row => JSON.stringify(row)).join("\n")+"\n";
await writeFile(path.join(root,"runtime.events.jsonl"),lines);
const a = children[0], source = sources[0];
await write("reviews/ai.ai-verified.json",{ artifact_type: "thesis_score_receipt", execution_id: a.execution_id, run_id: a.run_id, source_path: source.file, source_sha256: source.hash,
  scoring_mode: "ai", rubric_version: "scoring.v4", status: "final", generated_at: "2026-10-12T00:00:20Z", method: a.selected_method, config,
  components: { Smethod: 2.5, Spayload: 1.5, Sexploit: 2, Schain: 1, Soutput: 4 }, Spayload_final: 1.5, Srun_final: 2.3,
  numerator: 3, denominator: 2, formula: { Smethod: .2, Spayload: .2, Sexploit: .3, Schain: .1, Soutput: .2 },
  candidate_grades: [{ candidate_id: "fixture-candidate-1",score:1 },{ candidate_id: "fixture-candidate-2",score:2 }],
  component_evidence_refs: { Sexploit: ["#/response_evidence/0"] },
  metrics: { schema_version: "research-metrics.v2", metrics_epoch: "scoring-policy.v4.2",
    values: { full_exploit_rate: 0, guardrail_activation_rate: 0, first_choice_accuracy: null },
    availability: { full_exploit_rate: true, guardrail_activation_rate: true, first_choice_accuracy: false },
    unavailable_reason: { full_exploit_rate: null, guardrail_activation_rate: null,
      first_choice_accuracy: "no_preregistered_optimal_method_ranking" },
    denominators: {
      full_exploit_rate: { numerator: 0, denominator: 2, population: "assessable_candidates",
        origin: "all", method: a.selected_method, visit_id: null, coverage: 0.5 },
      guardrail_activation_rate: { numerator: 0, denominator: 4, population: "model_calls",
        origin: null, method: a.selected_method, visit_id: null },
      first_choice_accuracy: { numerator: null, denominator: null, population: "model_decisions",
        origin: null, method: a.selected_method, visit_id: null },
    } },
});
await write("reviews/human.review-status.json",{ artifact_type: "thesis_review_status", execution_id: a.execution_id, source_path: source.file, source_sha256: source.hash,
  generated_at: "2026-10-12T00:00:21Z", rubric_version: "scoring.v4", method: a.selected_method, config,
  workflows: { human: { status: "pending", reason: "pending_candidate_grades", Spayload_final: null, Srun_final: null } },
});
if (process.argv.includes("--overview")) {
  const standalone = { schema_version: "tui.v1", execution_id: "overview-standalone", status: "success",
    execution_status: "completed", security_outcome: null, experiment_condition: "Saved baseline", target_method: "fixture-method",
    provider: "fixture", model: "fixture-model", config: {}, created_at: "2026-10-17T00:00:00Z" };
  await write("overview-standalone.json", standalone);
  await write("overview-orphan.json", { ...standalone, execution_id: "overview-orphan", matrix_execution_id: "absent-parent" });
  for (const dir of ["one", "two"]) await write(`${dir}/overview-ambiguous.json`, { ...standalone, execution_id: "overview-ambiguous" });
  await write("overview-unavailable/runtime.json", { schema_version: "runtime-descriptor.v1",
    execution_id: "overview-unavailable", mode: "single-run", status: "finished", started_at: "2026-10-16T00:00:00Z" });
}
console.log(root);
