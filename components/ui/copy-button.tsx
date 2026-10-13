"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  return <span className="copy-control">
    <Button variant="ghost" aria-label={`Copy ${label}`} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setState("copied"); }
      catch { setState("error"); }
    }}>{state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{state === "copied" ? "Copied" : "Copy"}</Button>
    <span role="status" className={state === "error" ? "copy-error" : "sr-only"}>{state === "error" ? "Copy unavailable. Select the value to copy." : state === "copied" ? `${label} copied` : ""}</span>
  </span>;
}
