/**
 * Local JSON persistence. Everything the dashboard creates lives under
 * ~/.baseline-workforce/ — chats, goals, journal, boards, runs. Source data
 * (~/.claude, ~/.hermes, ~/.openclaw) is only ever read.
 */

import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { WORKFORCE_HOME } from "./config";

export const DATA_DIR = WORKFORCE_HOME;

export function dataPath(...parts: string[]): string {
  return path.join(DATA_DIR, ...parts);
}

async function ensureDir(file: string) {
  await mkdir(path.dirname(file), { recursive: true });
}

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(dataPath(rel), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write via a temp file + rename so a crash mid-write cannot corrupt state. */
export async function writeJson(rel: string, value: unknown): Promise<void> {
  const file = dataPath(rel);
  await ensureDir(file);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export async function listJson(relDir: string): Promise<string[]> {
  try {
    const items = await readdir(dataPath(relDir));
    return items.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export async function removeJson(rel: string): Promise<void> {
  try {
    await unlink(dataPath(rel));
  } catch {
    /* already gone */
  }
}

/** Filenames coming from the browser must never escape the data directory. */
export function safeSlug(input: string, fallback = "item"): string {
  const cleaned = String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ── Chat transcripts ────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  /** Tool calls observed while this reply streamed. */
  tools?: { name: string; detail: string }[];
  tokens?: { input: number; output: number; costUsd: number };
  agentId?: string;
}

export interface Conversation {
  agentId: string;
  messages: StoredMessage[];
  updatedAt: number;
}

export async function readConversation(agentId: string): Promise<Conversation> {
  const slug = safeSlug(agentId, "agent");
  return readJson<Conversation>(`chats/${slug}.json`, { agentId: slug, messages: [], updatedAt: 0 });
}

export async function writeConversation(agentId: string, messages: StoredMessage[]): Promise<void> {
  const slug = safeSlug(agentId, "agent");
  const trimmed = messages.slice(-400);
  await writeJson(`chats/${slug}.json`, { agentId: slug, messages: trimmed, updatedAt: Date.now() });
}

export async function clearConversation(agentId: string): Promise<void> {
  await removeJson(`chats/${safeSlug(agentId, "agent")}.json`);
}
