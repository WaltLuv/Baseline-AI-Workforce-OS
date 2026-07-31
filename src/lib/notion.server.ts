/**
 * Notion: search the workspace the integration token can see.
 * Token resolves env → 1Password → local store. No token → setup-needed.
 */

import { resolveSecret } from "./credentials.server";

const NOTION_VERSION = "2022-06-28";

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export interface NotionState {
  state: "ok" | "setup-needed" | "error";
  detail: string;
  pages: NotionPage[];
}

function titleOf(page: Record<string, unknown>): string {
  const props = (page.properties ?? {}) as Record<string, { type?: string; title?: { plain_text?: string }[] }>;
  for (const p of Object.values(props)) {
    if (p?.type === "title" && Array.isArray(p.title)) {
      const t = p.title.map((x) => x.plain_text ?? "").join("");
      if (t) return t;
    }
  }
  return "(untitled)";
}

async function search(query: string, pageSize: number): Promise<NotionState> {
  const token = resolveSecret("notion");
  if (!token) {
    return {
      state: "setup-needed",
      detail: "Add NOTION_TOKEN (env or Credentials page) and share pages with the integration.",
      pages: [],
    };
  }
  try {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query || undefined,
        page_size: pageSize,
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return { state: "error", detail: `Notion search answered ${res.status}`, pages: [] };
    const json = (await res.json()) as { results?: Record<string, unknown>[] };
    const pages = (json.results ?? []).map((p) => ({
      id: String(p.id ?? ""),
      title: titleOf(p),
      url: String(p.url ?? ""),
      lastEdited: String(p.last_edited_time ?? ""),
    }));
    return { state: "ok", detail: `${pages.length} page${pages.length === 1 ? "" : "s"}`, pages };
  } catch {
    return { state: "error", detail: "could not reach api.notion.com", pages: [] };
  }
}

let cache: { at: number; value: NotionState } | null = null;
const TTL = 5 * 60_000;

/** Recent pages (cached) — feeds the Integrations tab and the memory brain. */
export async function notionRecent(force = false): Promise<NotionState> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const value = await search("", 20);
  cache = { at: Date.now(), value };
  return value;
}

export async function notionSearch(query: string): Promise<NotionState> {
  return search(query, 25);
}
