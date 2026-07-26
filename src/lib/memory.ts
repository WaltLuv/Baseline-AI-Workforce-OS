/**
 * Memory: your notes, plus what the workforce has written down.
 *
 * Sources, in order of preference:
 *   1. the Obsidian vault, when one is configured
 *   2. ~/.baseline-workforce (goals, journal, boards) — always present
 * Nothing is uploaded; the graph is built on this machine, on request.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config";
import { DATA_DIR } from "./store";

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules", "chats", "workspace"]);

export interface Note {
  path: string; // relative to its root
  root: "vault" | "workforce";
  title: string;
  mtime: number;
  size: number;
}

function roots(): { root: "vault" | "workforce"; dir: string }[] {
  const cfg = loadConfig();
  const out: { root: "vault" | "workforce"; dir: string }[] = [];
  if (cfg.vaultRoot && existsSync(cfg.vaultRoot)) out.push({ root: "vault", dir: cfg.vaultRoot });
  if (existsSync(DATA_DIR)) out.push({ root: "workforce", dir: DATA_DIR });
  return out;
}

export function rootDir(root: "vault" | "workforce"): string | null {
  return roots().find((r) => r.root === root)?.dir ?? null;
}

async function walk(dir: string, base: string, root: "vault" | "workforce", depth: number, out: Note[]) {
  if (depth > 6 || out.length > 4000) return;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(abs, base, root, depth + 1, out);
    } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
      const st = await stat(abs).catch(() => null);
      if (!st) continue;
      out.push({
        path: path.relative(base, abs),
        root,
        title: path.basename(e.name).replace(/\.(md|markdown)$/i, ""),
        mtime: st.mtimeMs,
        size: st.size,
      });
    }
  }
}

export async function listNotes(): Promise<Note[]> {
  const out: Note[] = [];
  for (const { root, dir } of roots()) await walk(dir, dir, root, 0, out);
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function absOf(note: { root: "vault" | "workforce"; path: string }): string | null {
  const base = rootDir(note.root);
  if (!base) return null;
  const abs = path.resolve(base, note.path);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) return null;
  return abs;
}

export interface NoteHit extends Note {
  preview: string;
  score: number;
}

export async function searchNotes(query: string, limit = 40): Promise<NoteHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const notes = await listNotes();
  const hits: NoteHit[] = [];
  for (const note of notes.slice(0, 2500)) {
    const abs = absOf(note);
    if (!abs) continue;
    const content = await readFile(abs, "utf8").catch(() => null);
    if (content === null) continue;
    const idx = content.toLowerCase().indexOf(q);
    const titleHit = note.title.toLowerCase().includes(q);
    if (idx === -1 && !titleHit) continue;
    const at = idx === -1 ? 0 : idx;
    const start = Math.max(0, at - 110);
    const preview = `${start > 0 ? "…" : ""}${content.slice(start, at + 150).replace(/\s+/g, " ").trim()}…`;
    hits.push({ ...note, preview, score: (titleHit ? 8 : 0) + Math.max(0, 5 - Math.floor(at / 600)) + 1 });
    if (hits.length >= limit * 3) break;
  }
  return hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime).slice(0, limit);
}

export async function readNote(root: "vault" | "workforce", rel: string): Promise<{ content: string; mtime: number } | null> {
  const abs = absOf({ root, path: rel });
  if (!abs || !existsSync(abs)) return null;
  const [content, st] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
  return { content, mtime: st.mtimeMs };
}

// ── Graph ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  mtime: number;
}
export interface GraphLink {
  source: string;
  target: string;
  kind: "wikilink" | "folder";
}
export interface MemoryGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: { notes: number; links: number; folders: number; newest: number };
}

/** Build a graph from `[[wikilinks]]` plus folder membership. */
export async function buildGraph(maxNotes = 400): Promise<MemoryGraph> {
  const notes = (await listNotes()).slice(0, maxNotes);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const byTitle = new Map<string, string>();
  const folders = new Set<string>();

  for (const n of notes) {
    const id = `${n.root}:${n.path}`;
    nodes.push({
      id,
      label: n.title,
      group: path.dirname(n.path).split(path.sep)[0] || n.root,
      size: Math.min(30, 6 + Math.round(n.size / 900)),
      mtime: n.mtime,
    });
    byTitle.set(n.title.toLowerCase(), id);
    const folder = path.dirname(n.path).split(path.sep)[0];
    if (folder && folder !== ".") folders.add(folder);
  }

  for (const n of notes) {
    const abs = absOf(n);
    if (!abs) continue;
    const content = await readFile(abs, "utf8").catch(() => "");
    if (!content) continue;
    const id = `${n.root}:${n.path}`;
    const seen = new Set<string>();
    for (const m of content.matchAll(/\[\[([^\]|#]+)/g)) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (!target || target === id || seen.has(target)) continue;
      seen.add(target);
      links.push({ source: id, target, kind: "wikilink" });
    }
  }

  // Notes with no wikilinks still belong somewhere: tie them to their folder hub.
  const linked = new Set(links.flatMap((l) => [l.source, l.target]));
  for (const folder of folders) {
    const hubId = `folder:${folder}`;
    const members = nodes.filter((n) => n.group === folder && !linked.has(n.id));
    if (members.length < 2) continue;
    nodes.push({ id: hubId, label: folder, group: folder, size: 14, mtime: Date.now() });
    for (const m of members) links.push({ source: hubId, target: m.id, kind: "folder" });
  }

  return {
    nodes,
    links,
    stats: {
      notes: notes.length,
      links: links.length,
      folders: folders.size,
      newest: notes[0]?.mtime ?? 0,
    },
  };
}
