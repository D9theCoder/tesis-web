import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readLibrary } from "@/lib/server/chat/library";
import { stateDir } from "@/lib/server/control/paths";
import { realInside, redact, tesisRoot } from "@/lib/server/fs-util";

export type Chunk = { source: string; line: number; text: string; terms: string[]; required?: boolean; attachment?: boolean };
export type DocumentationExcerpt = { id: string; source: string; line: number; text: string };
type Embed = (texts: string[]) => Promise<number[][]>;
const MODEL = "Xenova/multilingual-e5-small";
const MODEL_REVISION = "761b726";
const MODEL_KEY = `${MODEL}@${MODEL_REVISION}:q8:mean:v1`;
const stop = new Set("a an and are as at be by can do does for from how i in is it me my of on or the this to what when where which with you your please explain tell about system use using".split(" "));
const terms = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}_][\p{L}\p{N}_-]{1,}/gu) ?? []).filter((term) => !stop.has(term));

/** Split at line boundaries where possible, retaining the original source line. */
export function chunksForText(source: string, text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let block = "", startLine = 1;
  const flush = () => { const content = block.trim(); if (content) chunks.push({ source, line: startLine, text: content, terms: terms(content) }); block = ""; };
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    if (block && block.length + original.length + 1 > 1100) flush();
    if (!block) startLine = line;
    if (original.length > 1100) {
      for (let offset = 0; offset < original.length; offset += 1100) {
        block = original.slice(offset, offset + 1100); startLine = line; flush();
      }
    } else block += `${block ? "\n" : ""}${original}`;
  }
  flush();
  return chunks;
}

async function filesIn(root: string, directory: string, recursive = true): Promise<string[]> {
  const safe = await realInside(root, directory);
  if (!safe) return [];
  try {
    const entries = await fs.readdir(safe, { withFileTypes: true });
    const nested = recursive ? await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => filesIn(root, path.join(safe, entry.name)))) : [];
    return [...entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "AGENTS.md").map((entry) => path.join(safe, entry.name)), ...nested.flat()];
  } catch { return []; }
}

async function documentationChunks(webRoot: string, runtimeRoot: string, knownSecrets: string[]): Promise<Chunk[]> {
  const roots = [{ root: webRoot, name: "tesis-web" }, { root: runtimeRoot, name: "tesis" }];
  const chunks: Chunk[] = [];
  for (const { root, name } of roots) {
    const candidates = [...await filesIn(root, root, false), ...await filesIn(root, path.join(root, "docs"))];
    for (const candidate of candidates.sort()) {
      const safe = await realInside(root, candidate);
      if (!safe) continue;
      try {
        const stat = await fs.stat(safe);
        if (!stat.isFile() || stat.size > 500_000) continue;
        const source = `${name}/${path.relative(root, safe).split(path.sep).join("/")}`;
        const text = String(redact(await fs.readFile(safe, "utf8"), true, knownSecrets));
        chunks.push(...chunksForText(source, text));
      } catch { /* A removed or unreadable document is skipped. */ }
    }
  }
  return chunks;
}

function lexicalOrder(query: string, chunks: Chunk[]) {
  const queryTerms = [...new Set(terms(query))].slice(0, 40);
  const frequencies = new Map(queryTerms.map((term) => [term, chunks.filter((chunk) => chunk.terms.includes(term)).length]));
  return chunks.map((chunk, index) => {
    const counts = new Map<string, number>();
    for (const term of chunk.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    const sourceTerms = terms(chunk.source);
    const score = queryTerms.reduce((sum, term) => {
      const count = counts.get(term) ?? 0;
      if (!count && !sourceTerms.includes(term)) return sum;
      const idf = Math.log(1 + (chunks.length + 1) / ((frequencies.get(term) ?? 0) + 1));
      return sum + idf * (count / (count + 1.2) + (sourceTerms.includes(term) ? 0.5 : 0));
    }, 0);
    return { index, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
}

function excerpts(chunks: Chunk[], indexes: number[]): DocumentationExcerpt[] {
  const chosen: Chunk[] = [];
  const ranked = indexes.map((index) => chunks[index]);
  const attachment = ranked.find((chunk) => chunk.attachment) ?? chunks.find((chunk) => chunk.attachment);
  for (const chunk of [...chunks.filter((item) => item.required), ...(attachment ? [attachment] : []), ...ranked]) {
    if (!chunk || chosen.some((other) => other.source === chunk.source && Math.abs(other.line - chunk.line) < 8)) continue;
    chosen.push(chunk);
    if (chosen.length === 5) break;
  }
  return chosen.map((chunk, index) => ({ id: `S${index + 1}`, source: chunk.source, line: chunk.line, text: chunk.text }));
}

/** The existing keyword path remains useful as a local fallback. */
export async function retrieveDocumentation(query: string, webRoot = process.cwd(), runtimeRoot = tesisRoot(), knownSecrets: string[] = []): Promise<DocumentationExcerpt[]> {
  const chunks = await documentationChunks(webRoot, runtimeRoot, knownSecrets);
  return excerpts(chunks, lexicalOrder(query, chunks).map(({ index }) => index));
}

let modelPromise: Promise<Embed> | undefined;
async function localEmbedder(): Promise<Embed> {
  modelPromise ??= (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const cacheDir = path.join(stateDir(), "chat-models");
    const modelDir = path.join(cacheDir, MODEL, MODEL_REVISION);
    const cached = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"].every((file) => existsSync(path.join(modelDir, file)));
    const extractor = await pipeline("feature-extraction", cached ? modelDir : MODEL, { dtype: "q8", device: "cpu", revision: MODEL_REVISION, cache_dir: cacheDir, local_files_only: cached });
    return async (texts: string[]) => {
      const tensor = await extractor(texts, { pooling: "mean", normalize: true });
      if (tensor.dims.length !== 2 || tensor.dims[0] !== texts.length || tensor.dims[1] !== 384) throw new Error("Invalid embedding dimensions");
      return texts.map((_, row) => Array.from({ length: 384 }, (_, col) => Number(tensor.data[row * 384 + col])));
    };
  })();
  try { return await modelPromise; } catch (error) { modelPromise = undefined; throw error; }
}

function digest(text: string) { return createHash("sha256").update(MODEL_KEY).update("\0").update(text).digest("hex"); }
function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 384 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}
async function readCache(): Promise<Record<string, number[]>> {
  try {
    const file = path.join(stateDir(), "chat-embeddings.json");
    if ((await fs.stat(file)).size > 100_000_000) return {};
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const cache = parsed as { model?: unknown; vectors?: unknown };
    if (cache.model !== MODEL_KEY || !cache.vectors || typeof cache.vectors !== "object" || Array.isArray(cache.vectors)) return {};
    return Object.fromEntries(Object.entries(cache.vectors).filter(([key, value]) => /^[a-f0-9]{64}$/.test(key) && validVector(value))) as Record<string, number[]>;
  } catch { return {}; }
}
async function writeCache(vectors: Record<string, number[]>) {
  await fs.mkdir(stateDir(), { recursive: true, mode: 0o700 });
  const temporary = path.join(stateDir(), `.chat-embeddings-${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, JSON.stringify({ model: MODEL_KEY, vectors }), { mode: 0o600, flag: "wx" }); await fs.rename(temporary, path.join(stateDir(), "chat-embeddings.json")); }
  finally { await fs.rm(temporary, { force: true }); }
}
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("Chat canceled", "AbortError"); }
function cosine(left: number[], right: number[]) {
  let dot = 0, a = 0, b = 0;
  for (let i = 0; i < left.length; i++) { dot += left[i] * right[i]; a += left[i] ** 2; b += right[i] ** 2; }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}

/** Hybrid ranking uses an ordinary array scan; there is no vector database. */
export async function retrieveChatContext(query: string, options: { knownSecrets?: string[]; extra?: Chunk[]; signal?: AbortSignal; embed?: Embed; cache?: boolean; webRoot?: string; runtimeRoot?: string } = {}) {
  const knownSecrets = options.knownSecrets ?? [];
  const chunks = await documentationChunks(options.webRoot ?? process.cwd(), options.runtimeRoot ?? tesisRoot(), knownSecrets);
  for (const document of await readLibrary()) for (const page of document.pages) {
    const source = `upload/${String(redact(document.name, true, knownSecrets))} [${document.id}]${page.page ? ` (page ${page.page})` : ""}`;
    chunks.push(...chunksForText(source, String(redact(page.text, true, knownSecrets))));
  }
  chunks.push(...options.extra ?? []);
  const lexical = lexicalOrder(query, chunks);
  if (!chunks.length || !query.trim()) return { excerpts: excerpts(chunks, lexical.map((item) => item.index)), mode: "keyword" as const };
  try {
    checkAbort(options.signal);
    const embed = options.embed ?? await localEmbedder();
    const cache = options.cache === false ? {} : await readCache();
    const ids = chunks.map((chunk) => digest(chunk.text));
    const missing = new Map<string, string>();
    for (const [index, id] of ids.entries()) if (!validVector(cache[id])) missing.set(id, chunks[index].text);
    const entries = [...missing];
    for (let start = 0; start < entries.length; start += 8) {
      checkAbort(options.signal);
      const batch = entries.slice(start, start + 8);
      const vectors = await embed(batch.map(([, text]) => `passage: ${text}`));
      if (vectors.length !== batch.length || vectors.some((vector) => !validVector(vector))) throw new Error("Invalid document embeddings");
      batch.forEach(([id], index) => { cache[id] = vectors[index]; });
    }
    checkAbort(options.signal);
    const [queryVector] = await embed([`query: ${query.slice(0, 4000)}`]);
    if (!validVector(queryVector)) throw new Error("Invalid query embedding");
    if (options.cache !== false && entries.length) {
      const current = Object.fromEntries([...new Set(ids)].map((id) => [id, cache[id]]));
      await writeCache(current);
    }
    const semantic = chunks.map((_, index) => ({ index, score: cosine(queryVector, cache[ids[index]]) }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 20);
    const fused = new Map<number, number>();
    for (const [rank, item] of semantic.entries()) fused.set(item.index, 0.7 / (60 + rank + 1));
    for (const [rank, item] of lexical.slice(0, 20).entries()) fused.set(item.index, (fused.get(item.index) ?? 0) + 0.3 / (60 + rank + 1));
    const order = [...fused].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([index]) => index);
    // Reserve the strongest keyword hit even when semantic or partial matches rank above it.
    if (lexical.length) order.unshift(lexical[0].index);
    return { excerpts: excerpts(chunks, order), mode: "hybrid" as const };
  } catch {
    checkAbort(options.signal);
    return { excerpts: excerpts(chunks, lexical.map((item) => item.index)), mode: "keyword" as const };
  }
}
