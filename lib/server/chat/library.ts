import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { stateDir } from "@/lib/server/control/paths";
import { ControlError } from "@/lib/server/control/errors";
import { realInside, redact } from "@/lib/server/fs-util";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 2_000_000;
const MAX_PAGES = 200;
const MAX_DOCUMENTS = 50;
const documentSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), name: z.string().min(1).max(200),
  createdAt: z.string(), pages: z.array(z.object({ page: z.number().int().positive().nullable(), text: z.string() })).min(1),
});
export type LibraryDocument = z.infer<typeof documentSchema>;
export type LibraryItem = Pick<LibraryDocument, "id" | "name" | "createdAt"> & { pages: number };

function libraryDir() { return path.join(stateDir(), "chat-knowledge"); }

/** Read only files created by this library. Request values never become paths. */
export async function readLibrary(): Promise<LibraryDocument[]> {
  let entries;
  try { entries = await fs.readdir(libraryDir(), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const documents: LibraryDocument[] = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))) {
    const safe = await realInside(libraryDir(), path.join(libraryDir(), entry.name));
    if (!safe) continue;
    const parsed = documentSchema.safeParse(JSON.parse(await fs.readFile(safe, "utf8")));
    if (!parsed.success || entry.name !== `${parsed.data.id}.json`) throw new ControlError("A saved knowledge file is invalid. Remove or restore it from the local state directory.", 500);
    documents.push(parsed.data);
  }
  return documents;
}

export function libraryItems(documents: LibraryDocument[], knownSecrets: string[] = []): LibraryItem[] {
  return documents.map(({ id, name, createdAt, pages }) => ({ id, name: String(redact(name, true, knownSecrets)), createdAt, pages: pages.length }));
}

async function extractPdf(bytes: Uint8Array): Promise<LibraryDocument["pages"]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, stopAtErrors: true,
    cMapUrl: path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps") + path.sep, cMapPacked: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_PAGES) throw new ControlError(`PDF files may have at most ${MAX_PAGES} pages.`, 413);
    const pages: LibraryDocument["pages"] = [];
    let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
      page.cleanup();
      length += text.length;
      if (length > MAX_EXTRACTED_CHARS) throw new ControlError("The extracted text is too large. Split the document into smaller files.", 413);
      if (text) pages.push({ page: number, text });
    }
    if (!pages.length) throw new ControlError("No searchable text was found in this PDF. Scanned images need OCR first.", 422);
    return pages;
  } catch (error) {
    if (error instanceof ControlError) throw error;
    throw new ControlError("Could not read this PDF. Check that it is valid and not password protected.", 422);
  } finally { await loading.destroy(); }
}

export async function addLibraryFile(file: File, knownSecrets: string[] = []): Promise<LibraryItem> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new ControlError("Choose a nonempty file of at most 10 MiB.", 413);
  const name = path.basename(file.name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  const ext = path.extname(name).toLowerCase();
  if (![".pdf", ".md", ".txt"].includes(ext)) throw new ControlError("Choose a PDF, Markdown, or plain-text file.", 415);
  if ((await readLibrary()).length >= MAX_DOCUMENTS) throw new ControlError(`The library can contain at most ${MAX_DOCUMENTS} files.`, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pages: LibraryDocument["pages"];
  if (ext === ".pdf") {
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new ControlError("This file does not appear to be a PDF.", 422);
    pages = await extractPdf(bytes);
  } else {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new ControlError("Text files must use UTF-8 encoding.", 422); }
    if (text.includes("\0") || !text.trim()) throw new ControlError("This file does not contain readable text.", 422);
    if (text.length > MAX_EXTRACTED_CHARS) throw new ControlError("The extracted text is too large. Split the document into smaller files.", 413);
    pages = [{ page: null, text }];
  }
  const document: LibraryDocument = { version: 1, id: randomUUID(), name: String(redact(name, true, knownSecrets)), createdAt: new Date().toISOString(),
    pages: pages.map((page) => ({ ...page, text: String(redact(page.text, true, knownSecrets)) })) };
  await fs.mkdir(libraryDir(), { recursive: true, mode: 0o700 });
  const target = path.join(libraryDir(), `${document.id}.json`);
  const temporary = path.join(libraryDir(), `.${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, JSON.stringify(document), { flag: "wx", mode: 0o600 }); await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
  return libraryItems([document])[0];
}

export async function removeLibraryFile(id: string): Promise<void> {
  const document = (await readLibrary()).find((item) => item.id === id);
  if (!document) throw new ControlError("This knowledge file is no longer available.", 404);
  const safe = await realInside(libraryDir(), path.join(libraryDir(), `${document.id}.json`));
  if (!safe) throw new ControlError("This knowledge file is no longer available.", 404);
  await fs.unlink(safe);
  // The cache contains derived data from the previous library. Rebuild it after removal.
  await fs.rm(path.join(stateDir(), "chat-embeddings.json"), { force: true });
}
