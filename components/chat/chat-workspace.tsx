"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Send, Square, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button, Dialog } from "@/components/ui/primitives";
import type { ReasoningTarget } from "@/lib/control-contract";
import styles from "./chat-workspace.module.css";

type Source = { id: string; source: string; line: number };
type Message = { id: string; role: "user" | "assistant"; text: string; trace?: string; summary?: string; model?: string; sources?: Source[]; status?: "streaming" | "complete" | "stopped" | "error"; error?: string };
type Chat = { id: string; title: string; target: string; modelName?: string; effort: string; messages: Message[] };
type Event = { type: string; text?: string; error?: string; sources?: Source[] };
const STORAGE = "tesis.chat.v1";
const savedMessage = z.object({ id: z.string(), role: z.enum(["user", "assistant"]), text: z.string(), trace: z.string().optional(), summary: z.string().optional(), model: z.string().optional(), sources: z.array(z.object({ id: z.string(), source: z.string(), line: z.number() })).optional(), status: z.enum(["streaming", "complete", "stopped", "error"]).optional(), error: z.string().optional() });
const savedChats = z.array(z.object({ id: z.string(), title: z.string(), target: z.string(), modelName: z.string().optional(), effort: z.string(), messages: z.array(savedMessage) }));
const newChat = (): Chat => ({ id: crypto.randomUUID(), title: "New conversation", target: "", effort: "", messages: [] });

export function ChatWorkspace() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const [targets, setTargets] = useState<ReasoningTarget[]>([]);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageWritable, setStorageWritable] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const active = chats.find((chat) => chat.id === activeId);
  const target = targets.find((item) => item.id === active?.target) ?? (!active?.target ? targets[0] : undefined);
  const changedTarget = Boolean(active?.modelName && target && active.modelName !== target.model);

  useEffect(() => {
    try {
      const saved = savedChats.parse(JSON.parse(localStorage.getItem(STORAGE) || "[]"));
      setChats(saved.map((chat) => ({ ...chat, messages: chat.messages.map((message) => message.status === "streaming" ? { ...message, status: "stopped" } : message) })));
      setActiveId(saved[0]?.id ?? "");
    } catch { setStorageWritable(false); setStorageError("Saved conversations could not be read. They will not be overwritten; new chats cannot be saved in this browser."); }
    setReady(true);
    const abort = new AbortController();
    fetch("/api/control/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "models" }), signal: abort.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load models."); setTargets(data.targets ?? []); })
      .catch((error: unknown) => { if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load models."); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!ready || !storageWritable) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify(chats)); setStorageError(""); }
      catch { setStorageError("This browser could not save conversations. Your current chat may be lost on reload."); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [chats, ready, storageWritable]);

  useEffect(() => {
    const element = messageList.current;
    if (element && followOutput.current) element.scrollTop = element.scrollHeight;
  }, [active?.messages]);

  const updateChat = (id: string, update: (chat: Chat) => Chat) => setChats((previous) => previous.map((chat) => chat.id === id ? update(chat) : chat));
  const create = () => { const chat = newChat(); setChats((previous) => [chat, ...previous]); setActiveId(chat.id); setDraft(""); };
  const send = async () => {
    if (!active || !target || changedTarget || !draft.trim() || busy) return;
    const chatId = active.id;
    followOutput.current = true;
    const user: Message = { id: crypto.randomUUID(), role: "user", text: draft.trim() };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", text: "", trace: "", summary: "", model: target.label, status: "streaming" };
    const history = active.messages.filter((message, index, all) => message.role === "assistant" ? message.status === "complete" && !!message.text : all[index + 1]?.status === "complete" && !!all[index + 1]?.text);
    const messages = [...history.map((message) => ({ role: message.role, content: message.text })), { role: "user", content: user.text }];
    updateChat(chatId, (chat) => ({ ...chat, target: target.id, modelName: target.model, title: chat.messages.length ? chat.title : user.text.slice(0, 60), messages: [...chat.messages, user, assistant] }));
    setDraft(""); setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    const updateMessage = (update: (message: Message) => Message) => updateChat(chatId, (chat) => ({ ...chat, messages: chat.messages.map((message) => message.id === assistant.id ? update(message) : message) }));
    let done = false;
    let responseDone = false;
    try {
      const response = await fetch("/api/control/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ action: "send", target: target.id, expectedModel: target.model, effort: active.effort || null, generateTitle: history.length === 0, messages }) });
      if (!response.ok || !response.body) { const data = await response.json(); throw new Error(data.error || "Could not start the chat."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
      while (true) {
        const { value, done: ended } = await reader.read();
        pending += decoder.decode(value, { stream: !ended });
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as Event;
          if (event.type === "error") throw new Error(event.error || "Provider request failed.");
          if (event.type === "done") { done = true; continue; }
          if (event.type === "response_done") { responseDone = true; setNaming(true); updateMessage((message) => ({ ...message, status: "complete" })); continue; }
          if (event.type === "title" && event.text) { const title = event.text; updateChat(chatId, (chat) => ({ ...chat, title })); continue; }
          const value = event.text ?? "";
          updateMessage((message) => {
            if (event.type === "text") return { ...message, text: message.text + value };
            if (event.type === "trace") return { ...message, trace: (message.trace ?? "") + value };
            if (event.type === "summary") return { ...message, summary: (message.summary ?? "") + value };
            if (event.type === "replace_text") return { ...message, text: value };
            if (event.type === "replace_summary") return { ...message, summary: value };
            if (event.type === "sources") return { ...message, sources: event.sources ?? [] };
            return message;
          });
        }
        if (ended) break;
      }
      if (!done) throw new Error("The stream ended before the provider completed its response.");
      updateMessage((message) => ({ ...message, status: "complete" }));
    } catch (error) {
      const stopped = abort.signal.aborted;
      if (!responseDone) updateMessage((message) => ({ ...message, status: stopped ? "stopped" : "error", error: stopped ? undefined : error instanceof Error ? error.message : "Chat failed." }));
      if (!stopped && error instanceof Error && ["Choose a configured model in Settings.", "The selected model has changed. Choose a model again."].includes(error.message)) {
        try {
          const latest = await fetch("/api/control/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "models" }), signal: abort.signal });
          if (latest.ok) { const data = await latest.json(); if (!abort.signal.aborted) setTargets(data.targets ?? []); }
        } catch { /* Keep the provider error visible; reloading can retry discovery. */ }
      }
    } finally { controller.current = null; setBusy(false); setNaming(false); }
  };

  return <div className={styles.page}>
    <header className="page-header"><div><h1 className="page-title">Chat</h1><p className="page-description">Talk to the models configured in Settings. Conversations are saved in this browser.</p></div></header>
    {storageError ? <p className="notice notice-error" role="alert">{storageError}</p> : null}
    <div className={styles.workspace}>
      <aside className={styles.history} aria-label="Conversations">
        <div className={styles.historyHeader}><h2>Conversations</h2><Button variant="outline" onClick={create} disabled={busy || !ready}><Plus size={15} /> New</Button></div>
        {chats.length ? <ul className={styles.chatList}>{chats.map((chat) => <li key={chat.id}><button type="button" className={chat.id === activeId ? styles.selected : ""} aria-current={chat.id === activeId ? "true" : undefined} disabled={busy} onClick={() => { followOutput.current = true; setActiveId(chat.id); setDraft(""); }}>{chat.title}</button></li>)}</ul> : <p className={styles.muted}>Start a conversation to keep it here.</p>}
      </aside>
      <section className={styles.conversation} aria-label="Chat conversation">
        {!active ? <div className={styles.empty}><h2>Start a conversation</h2><p>Choose a configured model and send a message.</p><Button variant="primary" onClick={create} disabled={!ready}><Plus size={16} /> New conversation</Button></div> : <>
          <div className={styles.toolbar}>
            <label>Model<select className="form-control" value={target?.id ?? active.target} disabled={busy || !targets.length} onChange={(event) => { const selected = targets.find((item) => item.id === event.target.value); updateChat(active.id, (chat) => ({ ...chat, target: event.target.value, modelName: selected?.model, effort: "" })); }}>
              {!target && active.target ? <option value={active.target}>Model no longer configured</option> : null}
              {targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label>Reasoning effort<select className="form-control" value={active.effort} disabled={busy || !target?.supported} onChange={(event) => updateChat(active.id, (chat) => ({ ...chat, effort: event.target.value }))}>
              <option value="">Saved setting{target?.effort ? ` (${target.effort})` : " (provider default)"}</option>
              {target?.efforts?.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
            </select></label>
            <Button variant="ghost" aria-label="Delete conversation" title="Delete conversation" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /></Button>
          </div>
          {loadError ? <p className="notice notice-error" role="alert">{loadError}</p> : !targets.length ? <p className="notice">No models available. Add and save one in <Link href="/settings">Settings</Link>.</p> : !target ? <p className="notice">This model is no longer configured. Choose another model.</p> : null}
          {changedTarget && target ? <div className="notice" role="alert">This profile now uses <strong>{target.model}</strong> instead of <strong>{active.modelName}</strong>. Select another model or confirm the updated model. <Button variant="outline" onClick={() => updateChat(active.id, (chat) => ({ ...chat, modelName: target.model, effort: "" }))}>Use updated model</Button></div> : null}
          <div className={styles.messages} aria-label="Messages" ref={messageList} onScroll={(event) => { const el = event.currentTarget; followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
            {!active.messages.length ? <div className={styles.emptyMessages}><h2>Ready when you are</h2><p>Messages go to the selected provider and may use credits or ChatGPT plan usage.</p></div> : active.messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
              <div className={styles.messageHeading}><strong>{message.role === "user" ? "You" : message.model || "Assistant"}</strong>{message.status === "streaming" ? <span role="status">Responding…</span> : message.status === "stopped" ? <span>Stopped</span> : message.status === "error" ? <span>Incomplete</span> : null}</div>
              {message.summary ? <details className={styles.reasoning}><summary>Reasoning summary</summary><div>{message.summary}</div></details> : null}
              {message.trace ? <details className={styles.reasoning}><summary>Reasoning trace</summary><div>{message.trace}</div></details> : null}
              {message.sources ? <details className={styles.sources}><summary>Documentation supplied ({message.sources.length})</summary>{message.sources.length ? <ul>{message.sources.map((source) => <li key={source.id}>[{source.id}] {source.source}:{source.line}</li>)}</ul> : <p>No matching documentation found.</p>}</details> : null}
              {message.text ? <div className={styles.messageText}>{message.text}</div> : message.status === "streaming" ? <p className={styles.muted}>Waiting for response…</p> : null}
              {message.role === "assistant" && message.status === "complete" && !message.summary && !message.trace ? <p className={styles.muted}>No reasoning was returned by the provider.</p> : null}
              {message.error ? <p className="notice notice-error" role="alert">{message.error}</p> : null}
            </article>)}
          </div>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <label htmlFor="chat-input">Message</label><textarea id="chat-input" className="form-control" rows={3} maxLength={50000} placeholder="Write a message…" value={draft} disabled={busy || !target || changedTarget} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
            <div className={styles.composerFooter}><span>{naming ? "Naming conversation with the selected model…" : "Enter to send · Shift+Enter for a new line. Relevant documentation is sent to the provider. The first reply includes a separate title request."}</span>{busy ? <Button variant="outline" onClick={() => controller.current?.abort()}><Square size={14} /> Stop</Button> : <Button type="submit" variant="primary" disabled={!target || changedTarget || !draft.trim()}><Send size={15} /> Send</Button>}</div>
          </form>
        </>}
      </section>
    </div>
    <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete conversation" footer={<><Button variant="ghost" data-dialog-initial-focus onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={() => { setChats((previous) => previous.filter((chat) => chat.id !== activeId)); setActiveId(""); setDraft(""); setConfirmDelete(false); }}>Delete conversation</Button></>}><p>Delete this conversation and its messages from this browser?</p></Dialog>
  </div>;
}
