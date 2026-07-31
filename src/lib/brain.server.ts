/**
 * The 3D Brain graph: one typed graph over everything this machine remembers.
 *
 * Node kinds: hub · workspace · note · decision · session · skill ·
 * vector_store · notion. Status is computed, not asserted: healthy (touched
 * recently), stale (untouched > 45 days), missing (a wikilink points at a note
 * that does not exist). External sources (Pinecone, Notion) appear only when
 * their keys resolve — absent keys mean absent nodes, not empty placeholders.
 */

import path from "node:path";
import { absOf, listNotes, type Note } from "./memory";
import { listSessions, listSkills } from "./claudeData";
import { pineconeState } from "./pinecone.server";
import { notionRecent } from "./notion.server";
import { readFile } from "node:fs/promises";

export type BrainKind =
  | "hub"
  | "workspace"
  | "note"
  | "decision"
  | "session"
  | "skill"
  | "vector_store"
  | "notion";
export type BrainStatus = "healthy" | "stale" | "missing";

export interface BrainNode {
  id: string;
  label: string;
  kind: BrainKind;
  status: BrainStatus;
  size: number;
  mtime: number;
  detail?: string;
}

export interface BrainLink {
  source: string;
  target: string;
  kind: "core" | "member" | "wikilink" | "cross";
}

export interface BrainGraph {
  nodes: BrainNode[];
  links: BrainLink[];
  stats: {
    notes: number;
    sessions: number;
    skills: number;
    vectorStores: number;
    notionPages: number;
    stale: number;
    missing: number;
  };
  sources: { id: string; label: string; state: "ok" | "setup-needed" | "error" | "empty"; detail: string }[];
}

const STALE_MS = 45 * 86_400_000;

function statusOf(mtime: number): BrainStatus {
  return Date.now() - mtime > STALE_MS ? "stale" : "healthy";
}

function noteKind(n: Note): BrainKind {
  return /decision/i.test(n.path) ? "decision" : "note";
}

export async function buildBrain(): Promise<BrainGraph> {
  const nodes: BrainNode[] = [];
  const links: BrainLink[] = [];
  const now = Date.now();

  const HUB = "hub:core";
  nodes.push({ id: HUB, label: "Memory Core", kind: "hub", status: "healthy", size: 26, mtime: now });

  const [notes, sessions, skills, pinecone, notion] = await Promise.all([
    listNotes().then((n) => n.slice(0, 260)),
    listSessions(24).catch(() => []),
    listSkills().catch(() => []),
    pineconeState().catch(() => null),
    notionRecent().catch(() => null),
  ]);

  // ── workspaces (top-level folders) + notes ────────────────────────────────
  const wsIds = new Map<string, string>();
  const noteId = (n: Note) => `note:${n.root}:${n.path}`;
  const byTitle = new Map<string, string>();

  for (const n of notes) {
    const folder = path.dirname(n.path).split(path.sep)[0];
    const wsKey = folder && folder !== "." ? `${n.root}/${folder}` : n.root;
    if (!wsIds.has(wsKey)) {
      const id = `ws:${wsKey}`;
      wsIds.set(wsKey, id);
      nodes.push({ id, label: wsKey, kind: "workspace", status: "healthy", size: 14, mtime: now });
      links.push({ source: HUB, target: id, kind: "core" });
    }
    const id = noteId(n);
    nodes.push({
      id,
      label: n.title,
      kind: noteKind(n),
      status: statusOf(n.mtime),
      size: Math.min(12, 4 + Math.round(n.size / 1500)),
      mtime: n.mtime,
      detail: `${n.root}:${n.path}`,
    });
    byTitle.set(n.title.toLowerCase(), id);
    links.push({ source: wsIds.get(wsKey) as string, target: id, kind: "member" });
  }

  // wikilinks + missing targets (capped read fan-out)
  let missing = 0;
  for (const n of notes.slice(0, 150)) {
    const abs = absOf(n);
    if (!abs) continue;
    const content = await readFile(abs, "utf8").catch(() => "");
    const from = noteId(n);
    const seen = new Set<string>();
    for (const m of content.matchAll(/\[\[([^\]|#]+)/g)) {
      const label = m[1].trim();
      const target = byTitle.get(label.toLowerCase());
      if (target) {
        if (target !== from && !seen.has(target)) {
          seen.add(target);
          links.push({ source: from, target, kind: "wikilink" });
        }
      } else if (missing < 20 && !seen.has(`missing:${label}`)) {
        seen.add(`missing:${label}`);
        const id = `missing:${label.toLowerCase()}`;
        if (!nodes.some((x) => x.id === id)) {
          nodes.push({ id, label, kind: "note", status: "missing", size: 5, mtime: 0, detail: "linked but not found" });
          missing++;
        }
        links.push({ source: from, target: id, kind: "wikilink" });
      }
    }
  }

  // ── sessions ──────────────────────────────────────────────────────────────
  const SESSIONS_HUB = "ws:sessions";
  if (sessions.length) {
    nodes.push({ id: SESSIONS_HUB, label: "Claude sessions", kind: "workspace", status: "healthy", size: 15, mtime: now });
    links.push({ source: HUB, target: SESSIONS_HUB, kind: "core" });
    for (const s of sessions) {
      const id = `session:${s.key}`;
      nodes.push({
        id,
        label: s.firstPrompt.slice(0, 42) || s.id.slice(0, 8),
        kind: "session",
        status: statusOf(s.updatedAt),
        size: Math.min(11, 4 + Math.round(s.messages / 40)),
        mtime: s.updatedAt,
        detail: `${s.project} · ${s.messages} messages`,
      });
      links.push({ source: SESSIONS_HUB, target: id, kind: "member" });
    }
  }

  // ── skills ────────────────────────────────────────────────────────────────
  const SKILLS_HUB = "ws:skills";
  if (skills.length) {
    nodes.push({ id: SKILLS_HUB, label: "Skills", kind: "workspace", status: "healthy", size: 14, mtime: now });
    links.push({ source: HUB, target: SKILLS_HUB, kind: "core" });
    for (const sk of skills.slice(0, 80)) {
      const id = `skill:${sk.source}:${sk.name}`;
      nodes.push({
        id,
        label: sk.name,
        kind: "skill",
        status: statusOf(sk.updatedAt || now),
        size: 6,
        mtime: sk.updatedAt || now,
        detail: sk.description?.slice(0, 90),
      });
      links.push({ source: SKILLS_HUB, target: id, kind: "member" });
    }
  }

  // ── Pinecone ──────────────────────────────────────────────────────────────
  if (pinecone?.state === "ok" && pinecone.indexes.length) {
    for (const idx of pinecone.indexes) {
      const id = `vector:${idx.name}`;
      nodes.push({
        id,
        label: idx.name,
        kind: "vector_store",
        status: "healthy",
        size: 12,
        mtime: now,
        detail: idx.vectors !== null ? `${idx.vectors.toLocaleString()} vectors` : "vector count unavailable",
      });
      links.push({ source: HUB, target: id, kind: "cross" });
    }
  }

  // ── Notion ────────────────────────────────────────────────────────────────
  if (notion?.state === "ok" && notion.pages.length) {
    const NOTION_HUB = "ws:notion";
    nodes.push({ id: NOTION_HUB, label: "Notion", kind: "workspace", status: "healthy", size: 14, mtime: now });
    links.push({ source: HUB, target: NOTION_HUB, kind: "core" });
    for (const p of notion.pages.slice(0, 25)) {
      const id = `notion:${p.id}`;
      const mtime = Date.parse(p.lastEdited) || now;
      nodes.push({ id, label: p.title.slice(0, 42), kind: "notion", status: statusOf(mtime), size: 6, mtime, detail: p.url });
      links.push({ source: NOTION_HUB, target: id, kind: "member" });
    }
  }

  const stale = nodes.filter((n) => n.status === "stale").length;
  return {
    nodes,
    links,
    stats: {
      notes: notes.length,
      sessions: sessions.length,
      skills: skills.length,
      vectorStores: pinecone?.state === "ok" ? pinecone.indexes.length : 0,
      notionPages: notion?.state === "ok" ? notion.pages.length : 0,
      stale,
      missing,
    },
    sources: [
      {
        id: "vault",
        label: "Notes (vault + workforce)",
        state: notes.length ? "ok" : "empty",
        detail: `${notes.length} notes indexed`,
      },
      {
        id: "claude",
        label: "Claude sessions",
        state: sessions.length ? "ok" : "empty",
        detail: `${sessions.length} recent sessions`,
      },
      {
        id: "pinecone",
        label: "Pinecone",
        state: pinecone?.state ?? "error",
        detail: pinecone?.detail ?? "unavailable",
      },
      { id: "notion", label: "Notion", state: notion?.state ?? "error", detail: notion?.detail ?? "unavailable" },
    ],
  };
}
