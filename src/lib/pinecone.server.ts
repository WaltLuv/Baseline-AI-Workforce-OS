/**
 * Pinecone: list your vector indexes with live vector counts.
 * Key resolves env → 1Password → local store, like every other credential.
 * No key → honest setup-needed; nothing here invents a vector count.
 */

import { resolveSecret } from "./credentials.server";

export interface PineconeIndex {
  name: string;
  dimension: number | null;
  metric: string | null;
  host: string | null;
  vectors: number | null; // null = count unavailable, not zero
}

export interface PineconeState {
  state: "ok" | "setup-needed" | "error";
  detail: string;
  indexes: PineconeIndex[];
  totalVectors: number;
}

let cache: { at: number; value: PineconeState } | null = null;
const TTL = 5 * 60_000;

export async function pineconeState(force = false): Promise<PineconeState> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const key = resolveSecret("pinecone");
  if (!key) {
    return {
      state: "setup-needed",
      detail: "Add PINECONE_API_KEY (env or Credentials page) to list your indexes.",
      indexes: [],
      totalVectors: 0,
    };
  }

  let value: PineconeState;
  try {
    const res = await fetch("https://api.pinecone.io/indexes", {
      headers: { "Api-Key": key.value, "X-Pinecone-Api-Version": "2025-01" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) {
      value = { state: "error", detail: `index list answered ${res.status}`, indexes: [], totalVectors: 0 };
    } else {
      const json = (await res.json()) as { indexes?: Record<string, unknown>[] };
      const indexes: PineconeIndex[] = (json.indexes ?? []).map((i) => ({
        name: String(i.name ?? ""),
        dimension: typeof i.dimension === "number" ? i.dimension : null,
        metric: typeof i.metric === "string" ? i.metric : null,
        host: typeof i.host === "string" ? i.host : null,
        vectors: null,
      }));
      // Vector counts come from each index's own host; cap the fan-out.
      await Promise.all(
        indexes.slice(0, 6).map(async (idx) => {
          if (!idx.host) return;
          try {
            const st = await fetch(`https://${idx.host}/describe_index_stats`, {
              method: "POST",
              headers: { "Api-Key": key.value, "Content-Type": "application/json" },
              body: "{}",
              signal: AbortSignal.timeout(5000),
            });
            if (st.ok) {
              const stats = (await st.json()) as { totalVectorCount?: number; total_vector_count?: number };
              idx.vectors = stats.totalVectorCount ?? stats.total_vector_count ?? null;
            }
          } catch {
            /* count stays null — shown as unavailable, not zero */
          }
        }),
      );
      value = {
        state: "ok",
        detail: `${indexes.length} index${indexes.length === 1 ? "" : "es"}`,
        indexes,
        totalVectors: indexes.reduce((a, i) => a + (i.vectors ?? 0), 0),
      };
    }
  } catch {
    value = { state: "error", detail: "could not reach api.pinecone.io", indexes: [], totalVectors: 0 };
  }
  cache = { at: Date.now(), value };
  return value;
}
