"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function CopyButton({ value, label }: { value: string; label: string }) {
  return <CopyValueButton key={JSON.stringify([value, label])} value={value} label={label} />;
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  return <span className="copy-control">
    <Button variant="ghost" aria-label={`Copy ${label}`} onClick={async () => {
      const id = ++request.current;
      try { await navigator.clipboard.writeText(value); if (request.current === id) setState("copied"); }
      catch { if (request.current === id) setState("error"); }
    }}>{state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{state === "copied" ? "Copied" : "Copy"}</Button>
    <span role="status" className={state === "error" ? "copy-error" : "sr-only"}>{state === "error" ? "Copy unavailable. Select the value to copy." : state === "copied" ? `${label} copied` : ""}</span>
  </span>;
}
