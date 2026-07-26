"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** One event from the NDJSON agent protocol (see lib/chatStream.ts). */
export interface StreamEvent {
  t: "meta" | "delta" | "think" | "tool" | "usage" | "err" | "end" | "final" | "files" | "text";
  text?: string;
  name?: string;
  detail?: string;
  command?: string;
  streamId?: string;
  input?: number;
  output?: number;
  costUsd?: number;
  code?: number | null;
  ok?: boolean;
  stopped?: boolean;
  files?: string[];
  project?: string;
}

/** POST a JSON body and walk the NDJSON response, one event at a time. */
export async function streamNdjson(
  url: string,
  body: unknown,
  onEvent: (evt: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    onEvent({ t: "err", text: detail || `request failed (${res.status})` });
    onEvent({ t: "end", ok: false, code: res.status });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        onEvent({ t: "delta", text: line });
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf) as StreamEvent);
    } catch {
      onEvent({ t: "delta", text: buf });
    }
  }
}

/** Small JSON fetch hook with a manual refresh and an optional poll interval. */
export function useJson<T>(url: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    const target = urlRef.current;
    if (!target) return;
    try {
      const res = await fetch(target, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData((await res.json()) as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(Boolean(url));
    void load();
    if (!opts.pollMs || !url) return;
    const id = setInterval(() => {
      // Polling a hidden tab wastes a spawn on every tick.
      if (typeof document === "undefined" || document.visibilityState === "visible") void load();
    }, opts.pollMs);
    return () => clearInterval(id);
  }, [url, opts.pollMs, load]);

  return { data, loading, error, refresh: load, setData };
}

/**
 * A named document persisted to ~/.baseline-workforce/boards/<name>.json.
 * Powers Kanban, Pipeline, Loop history, and each studio's saved work.
 */
export function useBoard<T extends object>(name: string, initial: T) {
  const [doc, setDoc] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/board?name=${encodeURIComponent(name)}`, { cache: "no-store" });
        const json = (await res.json()) as { doc?: Partial<T> };
        if (!cancelled && json.doc && Object.keys(json.doc).length) {
          setDoc({ ...initial, ...(json.doc as T) });
        }
      } catch {
        /* first run: no board yet */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `initial` is a literal at every call site; re-running on identity churn
    // would clobber freshly loaded state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const save = useCallback(
    (next: T) => {
      setDoc(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSaving(true);
        try {
          await fetch(`/api/board?name=${encodeURIComponent(name)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
        } catch {
          /* keep the in-memory copy; the next edit retries */
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [name],
  );

  return { doc, setDoc: save, loaded, saving };
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore unreadable storage */
    }
  }, [key]);
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode */
      }
    },
    [key],
  );
  return [value, update] as const;
}
