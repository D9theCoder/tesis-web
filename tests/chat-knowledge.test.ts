// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addLibraryFile, readLibrary, removeLibraryFile } from "@/lib/server/chat/library";
import { chunksForText, retrieveChatContext } from "@/lib/server/chat/retrieval";

let root: string;
let web: string;
let runtime: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tesis-chat-knowledge-"));
  web = path.join(root, "web"); runtime = path.join(root, "runtime");
  await fs.mkdir(web); await fs.mkdir(runtime);
  vi.stubEnv("TESIS_WEB_STATE_DIR", path.join(root, "state"));
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });

function pdfWithText(operand: string, font = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>") {
  const stream = `BT /F1 12 Tf 72 720 Td ${operand} Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    font,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

describe("shared chat documents", () => {
  it("stores searchable text locally, redacts known secrets, and removes derived cache with the file", async () => {
    const saved = await addLibraryFile(new File(["Scoring evidence\napi_key=abcsecretvalue\nknownsecretvalue"], "../evidence.md"), ["knownsecretvalue"]);
    expect(saved.name).toBe("evidence.md");
    const [document] = await readLibrary();
    expect(document.pages[0].text).toContain("Scoring evidence");
    expect(document.pages[0].text).not.toContain("abcsecretvalue");
    expect(document.pages[0].text).not.toContain("knownsecretvalue");
    await fs.writeFile(path.join(root, "state", "chat-embeddings.json"), "cached");
    await removeLibraryFile(saved.id);
    expect(await readLibrary()).toEqual([]);
    await expect(fs.stat(path.join(root, "state", "chat-embeddings.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("extracts text from a real PDF and rejects unsupported files", async () => {
    await addLibraryFile(new File([pdfWithText("(Evidence on page one)")], "report.pdf", { type: "application/pdf" }));
    expect((await readLibrary())[0].pages).toEqual([{ page: 1, text: "Evidence on page one" }]);
    await expect(addLibraryFile(new File(["data"], "script.js"))).rejects.toMatchObject({ status: 415 });
    await expect(addLibraryFile(new File(["not a pdf"], "bad.pdf"))).rejects.toMatchObject({ status: 422 });
  });

  it("extracts selectable CJK text using a predefined PDF character map", async () => {
    const font = "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >>] >>";
    await addLibraryFile(new File([pdfWithText("<4E2D6587>", font)], "chinese.pdf", { type: "application/pdf" }));
    expect((await readLibrary())[0].pages).toEqual([{ page: 1, text: "中文" }]);
  });
});

describe("local hybrid retrieval", () => {
  it.each([
    ["sqli_union", "The dashboard displays a graph of experiment progress."],
    ["SQL_ERROR_18456: login failed", "The dashboard displays a graph of experiment progress."],
    ["SQL_ERROR_18456: login failed", "The dashboard login failed while displaying experiment progress."],
  ])("retains an exact match for %s outside the semantic shortlist among %s", async (query, unrelated) => {
    await fs.mkdir(path.join(web, "docs"));
    await Promise.all(Array.from({ length: 20 }, (_, index) => fs.writeFile(path.join(web, "docs", `unrelated-${index}.md`), unrelated)));
    await fs.writeFile(path.join(web, "docs", "zz-exact.md"), `The recorded identifier or error is ${query}.`);
    const summary = { ...chunksForText("result/run-1 summary", "Execution: completed")[0], required: true };
    const artifact = { ...chunksForText("result/run-1 artifact", "Saved evidence for the selected run.")[0], attachment: true };
    const embed = async (texts: string[]) => texts.map((text) => Array.from({ length: 384 }, (_, index) => index === (text.startsWith("passage:") && text.includes(query) ? 1 : 0) ? 1 : 0));
    const result = await retrieveChatContext(query, { webRoot: web, runtimeRoot: runtime, embed, cache: false, extra: [summary, artifact] });
    expect(result.mode).toBe("hybrid");
    expect(result.excerpts).toHaveLength(5);
    expect(result.excerpts.map((item) => item.source)).toEqual(expect.arrayContaining(["tesis-web/docs/zz-exact.md", "result/run-1 summary", "result/run-1 artifact"]));
    expect(result.excerpts.some((item) => item.source.includes("unrelated-"))).toBe(true);
  });

  it("finds an English source for an Indonesian question, retains exact keyword matching, and reuses the cache", async () => {
    await fs.writeFile(path.join(web, "README.md"), "The SQL method is named sqli_union and is documented here.");
    await fs.writeFile(path.join(runtime, "README.md"), "The final scoring rubric calculates experiment outcomes from evidence.");
    const vectors = (index: number) => Array.from({ length: 384 }, (_, i) => i === index ? 1 : 0);
    const embed = vi.fn(async (texts: string[]) => texts.map((text) => vectors(/skor akhir|scoring rubric/i.test(text) ? 0 : 1)));
    const options = { webRoot: web, runtimeRoot: runtime, embed };
    const indonesian = await retrieveChatContext("bagaimana skor akhir dihitung", options);
    expect(indonesian.mode).toBe("hybrid");
    expect(indonesian.excerpts[0].source).toBe("tesis/README.md");
    const passageCalls = embed.mock.calls.flatMap(([items]) => items).filter((item) => item.startsWith("passage:"));
    expect(passageCalls).toHaveLength(2);
    const exact = await retrieveChatContext("sqli_union", options);
    expect(exact.excerpts[0].source).toBe("tesis-web/README.md");
    expect(embed.mock.calls.flatMap(([items]) => items).filter((item) => item.startsWith("passage:"))).toHaveLength(2);
    await fs.writeFile(path.join(runtime, "README.md"), "The updated scoring rubric uses reviewed evidence.");
    await retrieveChatContext("bagaimana skor akhir dihitung", options);
    expect(embed.mock.calls.flatMap(([items]) => items).filter((item) => item.startsWith("passage:"))).toHaveLength(3);
  });

  it("reports keyword fallback when the local model is unavailable", async () => {
    await fs.writeFile(path.join(web, "README.md"), "The sqli_union method is available.");
    const result = await retrieveChatContext("sqli_union", { webRoot: web, runtimeRoot: runtime, embed: async () => { throw new Error("model missing"); } });
    expect(result.mode).toBe("keyword");
    expect(result.excerpts[0].text).toContain("sqli_union");
  });

  it("supplies an explicitly selected run summary and artifact even when keyword search finds unrelated documentation", async () => {
    await fs.writeFile(path.join(web, "README.md"), "The settings page controls the model provider.");
    const summary = { ...chunksForText("result/run-1 summary", "Execution: failed")[0], required: true };
    const artifact = { ...chunksForText("result/run-1 artifact", "Saved evidence for the selected run.")[0], attachment: true };
    const result = await retrieveChatContext("settings model provider", { webRoot: web, runtimeRoot: runtime, extra: [summary, artifact], embed: async () => { throw new Error("model missing"); } });
    expect(result.excerpts.map((item) => item.source)).toEqual(expect.arrayContaining(["result/run-1 summary", "result/run-1 artifact", "tesis-web/README.md"]));
  });
});
