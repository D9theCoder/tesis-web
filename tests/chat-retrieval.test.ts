import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { retrieveDocumentation } from "@/lib/server/chat/retrieval";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("chat documentation retrieval", () => {
  it("ranks relevant local documents, redacts credentials, and excludes paths outside the roots", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "chat-retrieval-")); directories.push(base);
    const web = path.join(base, "web"), tesis = path.join(base, "tesis");
    await mkdir(path.join(tesis, "docs", "reference"), { recursive: true }); await mkdir(web);
    await writeFile(path.join(web, "README.md"), "# Web\nThe console displays experiment results.");
    await writeFile(path.join(tesis, "docs", "reference", "scoring.md"), "# Scoring rubric\nThe scoring rubric uses an oracle to measure outcomes.\napi_key=supersecretvalue\nknownsecretvalue");
    await writeFile(path.join(base, "outside.md"), "scoring rubric external secret");
    await symlink(path.join(base, "outside.md"), path.join(tesis, "docs", "reference", "external.md"));
    const results = await retrieveDocumentation("How does the scoring rubric use the oracle?", web, tesis, ["knownsecretvalue"]);
    expect(results[0]).toMatchObject({ id: "S1", source: "tesis/docs/reference/scoring.md", line: 1 });
    expect(results[0].text).not.toContain("supersecretvalue");
    expect(results[0].text).not.toContain("knownsecretvalue");
    expect(results.some((item) => item.source.includes("external"))).toBe(false);
  });
  it("returns no fabricated sources when nothing matches", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "chat-retrieval-")); directories.push(base);
    await writeFile(path.join(base, "README.md"), "Experiment settings.");
    expect(await retrieveDocumentation("xylophone", base, base)).toEqual([]);
  });
});
