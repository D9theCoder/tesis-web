"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/primitives";
import styles from "./chat-workspace.module.css";

const fileSchema = z.object({ id: z.string(), name: z.string(), createdAt: z.string(), pages: z.number() });
const runSchema = z.object({ executionId: z.string(), sha256: z.string(), name: z.string(), startedAt: z.string().nullable(), executionStatus: z.string().nullable(),
  kind: z.string(), securityOutcome: z.string().nullable(), model: z.string().nullable(), surface: z.string().nullable(), securityLevel: z.string().nullable() });
type LibraryItem = z.infer<typeof fileSchema>;
export type SelectedRun = { executionId: string; sha256: string; name: string; startedAt: string | null; executionStatus: string | null };
type Run = z.infer<typeof runSchema>;

function errorText(error: unknown) { return error instanceof Error ? error.message : "The request failed. Try again."; }
async function jsonResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const data: unknown = await response.json();
  if (!response.ok) { const parsed = z.object({ error: z.string() }).safeParse(data); throw new Error(parsed.success ? parsed.data.error : "The request failed. Try again."); }
  return schema.parse(data);
}
function timeLabel(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : date.toLocaleString();
}

export function KnowledgeControls({ selected, onSelect, disabled }: { selected?: SelectedRun; onSelect: (run?: SelectedRun) => void; disabled: boolean }) {
  const [files, setFiles] = useState<LibraryItem[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [runQuery, setRunQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [partial, setPartial] = useState(false);
  const [fileLoading, setFileLoading] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState("");
  const fileAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const fileDetails = useRef<HTMLDetailsElement>(null);
  const runDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => () => { fileAbort.current?.abort(); runAbort.current?.abort(); }, []);

  async function loadFiles() {
    setFileLoading("files"); setError("");
    const controller = new AbortController(); fileAbort.current = controller;
    try { const data = await jsonResponse(await fetch("/api/control/chat/knowledge", { signal: controller.signal }), z.object({ files: z.array(fileSchema) })); if (!controller.signal.aborted) setFiles(data.files); }
    catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setFileLoading(""); }
  }
  async function upload(file: File) {
    setFileLoading("upload"); setError("");
    const controller = new AbortController(); fileAbort.current = controller;
    try {
      const form = new FormData(); form.append("file", file);
      const data = await jsonResponse(await fetch("/api/control/chat/knowledge", { method: "POST", body: form, signal: controller.signal }), z.object({ file: fileSchema }));
      if (!controller.signal.aborted) setFiles((previous) => [...previous ?? [], data.file]);
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setFileLoading(""); }
  }
  async function removeFile(id: string) {
    setFileLoading("remove"); setError("");
    const controller = new AbortController(); fileAbort.current = controller;
    try {
      await jsonResponse(await fetch("/api/control/chat/knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: controller.signal }), z.object({ ok: z.literal(true) }));
      if (!controller.signal.aborted) setFiles((previous) => previous?.filter((file) => file.id !== id) ?? []);
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setFileLoading(""); }
  }
  async function loadRuns(cursor = 0, query = runQuery) {
    setRunLoading(true); setError("");
    const controller = new AbortController(); runAbort.current = controller;
    try {
      const params = new URLSearchParams({ cursor: String(cursor), q: query });
      const data = await jsonResponse(await fetch(`/api/control/chat/runs?${params}`, { signal: controller.signal }), z.object({ runs: z.array(runSchema), nextCursor: z.number().nullable(), partial: z.boolean() }));
      if (!controller.signal.aborted) { setRuns((previous) => cursor ? [...previous ?? [], ...data.runs] : data.runs); setNextCursor(data.nextCursor); setPartial(data.partial); setAppliedQuery(query); }
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)); }
    finally { if (!controller.signal.aborted) setRunLoading(false); }
  }

  return <div className={styles.knowledge}>
    <div className={styles.knowledgeActions}>
      <details ref={fileDetails} onToggle={(event) => { if (event.currentTarget.open) { if (runDetails.current) runDetails.current.open = false; if (files === null && !fileLoading) void loadFiles(); } }}>
        <summary>Shared files{files ? ` (${files.length})` : ""}</summary>
        <div className={styles.knowledgePanel}>
          <p>Uploaded files are available in every conversation. PDF, Markdown, and text files up to 10 MiB are supported.</p>
          <label className={styles.fileLabel}>Add a file<input type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" disabled={disabled || !!fileLoading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></label>
          {fileLoading ? <p role="status">{fileLoading === "upload" ? "Adding file…" : "Loading files…"}</p> : null}
          {files?.length ? <ul className={styles.fileList}>{files.map((file) => <li key={file.id}><span>{file.name}{file.pages > 1 ? ` · ${file.pages} pages` : ""}</span><Button type="button" variant="ghost" aria-label={`Remove ${file.name}`} disabled={disabled || !!fileLoading} onClick={() => void removeFile(file.id)}><Trash2 size={15} /></Button></li>)}</ul> : files ? <p>No files added yet.</p> : null}
          <p>Scanned PDFs require searchable text or OCR before upload.</p>
        </div>
      </details>
      <details ref={runDetails} onToggle={(event) => { if (event.currentTarget.open) { if (fileDetails.current) fileDetails.current.open = false; if (runs === null && !runLoading) void loadRuns(); } }}>
        <summary><Paperclip size={14} /> Select run artifact</summary>
        <div className={styles.knowledgePanel}>
          <p>Choose a saved run. Its recorded status and relevant artifact excerpts will be sent with your message.</p>
          <div className={styles.runSearch}><label>Find a run<input className="form-control" value={runQuery} maxLength={512} onChange={(event) => setRunQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!runLoading) void loadRuns(); } }} /></label><Button type="button" variant="outline" disabled={disabled || runLoading} onClick={() => void loadRuns()}>Search</Button></div>
          {runLoading ? <p role="status">Loading recent runs…</p> : null}
          {partial ? <p>Some sources could not be scanned; the list may be incomplete.</p> : null}
          {runs?.length ? <ul className={styles.runList}>{runs.map((run) => <li key={run.executionId}><button type="button" className={styles.runOption} disabled={disabled} aria-pressed={selected?.executionId === run.executionId && selected.sha256 === run.sha256} onClick={() => { onSelect({ executionId: run.executionId, sha256: run.sha256, name: run.name, startedAt: run.startedAt, executionStatus: run.executionStatus }); if (runDetails.current) runDetails.current.open = false; }}>
            <strong>{run.name}</strong><span>{timeLabel(run.startedAt)} · Execution: {run.executionStatus ?? "unavailable"} · {run.kind}</span>
            <span>{[run.model && `Model: ${run.model}`, run.surface && `Surface: ${run.surface}`, run.securityLevel && `Security: ${run.securityLevel}`, `Outcome: ${run.securityOutcome ?? "unavailable"}`].filter(Boolean).join(" · ")}</span><span className={styles.runId}>{run.executionId}</span>
          </button></li>)}</ul> : runs ? <p>No saved run artifacts are available.</p> : null}
          {nextCursor !== null ? <Button type="button" variant="outline" disabled={disabled || runLoading} onClick={() => void loadRuns(nextCursor, appliedQuery)}>Load more runs</Button> : null}
        </div>
      </details>
    </div>
    {selected ? <div className={styles.attachment}><span>Attached: <strong>{selected.name}</strong> · {timeLabel(selected.startedAt)} · Execution: {selected.executionStatus ?? "unavailable"}<small>{selected.executionId}</small></span><Button type="button" variant="ghost" aria-label="Remove attached run" disabled={disabled} onClick={() => onSelect(undefined)}><X size={15} /></Button></div> : null}
    {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
  </div>;
}
