import { promises as fs } from "node:fs";
import path from "node:path";
import { realInside, redact, tesisRoot } from "@/lib/server/fs-util";

type Chunk = { source: string; line: number; text: string; terms: string[] };
export type DocumentationExcerpt = { id: string; source: string; line: number; text: string };
const stop = new Set("a an and are as at be by can do does for from how i in is it me my of on or the this to what when where which with you your please explain tell about system use using".split(" "));
const terms = (text: string) => (text.toLowerCase().match(/[a-z0-9_][a-z0-9_-]{1,}/g) ?? []).filter((term) => !stop.has(term));

async function filesIn(root: string, directory: string): Promise<string[]> {
  const safe = await realInside(root, directory);
  if (!safe) return [];
  try {
    const entries = await fs.readdir(safe, { withFileTypes: true });
    const nested = await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => filesIn(root, path.join(safe, entry.name))));
    return [...entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "AGENTS.md").map((entry) => path.join(safe, entry.name)), ...nested.flat()];
  } catch { return []; }
}

/** Read only named documentation roots; no request-derived filesystem paths. */
export async function retrieveDocumentation(query: string, webRoot = process.cwd(), runtimeRoot = tesisRoot(), knownSecrets: string[] = []): Promise<DocumentationExcerpt[]> {
  const queryTerms = [...new Set(terms(query))].slice(0, 40);
  if (!queryTerms.length) return [];
  const roots = [{ root: webRoot, name: "tesis-web", files: ["README.md", "PRODUCT.md"], dirs: ["docs"] },
    { root: runtimeRoot, name: "tesis", files: ["README.md", "guide.md"], dirs: ["docs/reference", "docs/completed"] }];
  const chunks: Chunk[] = [];
  for (const { root, name, files, dirs } of roots) {
    const candidates = [...files.map((file) => path.join(root, file)), ...(await Promise.all(dirs.map((dir) => filesIn(root, path.join(root, dir))))).flat()];
    for (const candidate of candidates.sort()) {
      const safe = await realInside(root, candidate);
      if (!safe) continue;
      try {
        const stat = await fs.stat(safe);
        if (!stat.isFile() || stat.size > 500_000) continue;
        const text = String(redact(await fs.readFile(safe, "utf8"), true, knownSecrets));
        const lines = text.split(/\r?\n/);
        for (let start = 0; start < lines.length; start += 25) {
          const block = lines.slice(start, start + 30).join("\n").slice(0, 3000).trim();
          if (block) chunks.push({ source: `${name}/${path.relative(root, safe).split(path.sep).join("/")}`, line: start + 1, text: block, terms: terms(block) });
        }
      } catch { /* A removed or unreadable document is skipped. */ }
    }
  }
  const frequencies = new Map<string, number>();
  for (const term of queryTerms) frequencies.set(term, chunks.filter((chunk) => chunk.terms.includes(term)).length);
  const scored = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    for (const term of chunk.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    const sourceTerms = terms(chunk.source);
    const score = queryTerms.reduce((sum, term) => {
      const count = counts.get(term) ?? 0;
      if (!count && !sourceTerms.includes(term)) return sum;
      const idf = Math.log(1 + (chunks.length + 1) / ((frequencies.get(term) ?? 0) + 1));
      return sum + idf * (count / (count + 1.2) + (sourceTerms.includes(term) ? 0.5 : 0));
    }, 0);
    return { chunk, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.source.localeCompare(b.chunk.source) || a.chunk.line - b.chunk.line);
  const selected: Chunk[] = [];
  for (const { chunk } of scored) {
    if (selected.some((other) => other.source === chunk.source && Math.abs(other.line - chunk.line) < 30)) continue;
    selected.push(chunk);
    if (selected.length === 5) break;
  }
  return selected.map((chunk, index) => ({ id: `S${index + 1}`, source: chunk.source, line: chunk.line, text: chunk.text }));
}
