"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A changed identity hides old data immediately; abort alone cannot reject a
 * late response.
 *
 * `seed` is data the server already rendered into this page. Passing it means
 * the first paint shows real content and no client request is made; `refresh`
 * still reloads from the source afterwards.
 */
export function useReadResource<T>(
  key: string,
  load: (query: string, signal: AbortSignal, fresh: boolean) => Promise<T>,
  seed?: T,
) {
  const seededKey = useRef(seed === undefined ? undefined : key);
  const requestFresh = useRef(false);
  const [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState<{ key: string; revision: number; data?: T; error: string | null } | undefined>(
    seed === undefined ? undefined : { key, revision: 0, data: seed, error: null },
  );
  useEffect(() => {
    // The first render is already seeded by the server; do not refetch it.
    if (seededKey.current === key && revision === 0) return;
    const fresh = requestFresh.current;
    requestFresh.current = false;
    const controller = new AbortController();
    let stopped = false;
    load(key, controller.signal, fresh).then(data => {
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
    refresh: () => { requestFresh.current = true; setRevision(value => value + 1); } };
}
