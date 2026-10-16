"use client";

import { useEffect, useState } from "react";

/** A changed identity hides old data immediately; abort alone cannot reject a late response. */
export function useReadResource<T>(key: string, load: (query: string, signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState<{ key: string; revision: number; data?: T; error: string | null }>();
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    load(key, controller.signal).then(data => {
      if (!stopped) setSettled({ key, revision, data, error: null });
    }).catch((cause: unknown) => {
      if (!stopped) setSettled(previous => ({ key, revision, data: previous?.key === key ? previous.data : undefined,
        error: cause instanceof Error ? cause.message : "The saved source could not be retrieved." }));
    });
    return () => { stopped = true; controller.abort(); };
  }, [key, revision, load]);
  return { data: settled?.key === key ? settled.data : undefined,
    error: settled?.key === key ? settled.error : null,
    busy: settled?.key !== key || settled.revision !== revision,
    refresh: () => setRevision(value => value + 1) };
}
