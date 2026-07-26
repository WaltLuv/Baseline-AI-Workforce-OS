/**
 * Goals and Journal.
 *
 * Both live as JSON under ~/.baseline-workforce (so the UI is fast and never
 * has to parse markdown back), and are mirrored into your Obsidian vault as
 * readable markdown — goals as one file per month, journal as one file per day,
 * exactly as asked for.
 */

import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config";
import { readJson, writeJson, newId } from "./store";

export interface Goal {
  id: string;
  text: string;
  category?: string;
  done: boolean;
  createdAt: string;
  doneAt?: string;
}

export interface JournalEntry {
  id: string;
  text: string;
  at: string; // ISO timestamp
  mood?: string;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Absolute path inside the vault, or null when no vault is configured. */
export function vaultFile(...parts: string[]): string | null {
  const cfg = loadConfig();
  if (!cfg.vaultRoot) return null;
  return path.join(cfg.vaultRoot, cfg.vaultFolder, ...parts);
}

export async function writeVaultFile(rel: string[], content: string): Promise<string | null> {
  const abs = vaultFile(...rel);
  if (!abs) return null;
  try {
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return abs;
  } catch {
    // A missing or read-only vault must never break the page.
    return null;
  }
}

// ── Goals ───────────────────────────────────────────────────────────────────

export async function readGoals(): Promise<Goal[]> {
  return readJson<Goal[]>("goals.json", []);
}

export async function writeGoals(goals: Goal[]): Promise<{ vaultPath: string | null }> {
  await writeJson("goals.json", goals);
  const month = todayISO().slice(0, 7);
  const open = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done);
  const line = (g: Goal) =>
    `- [${g.done ? "x" : " "}] ${g.text}${g.category ? `  _(${g.category})_` : ""}`;
  const md = [
    `# Goals — ${month}`,
    "",
    `_Synced from Baseline AI Workforce · ${new Date().toLocaleString()}_`,
    "",
    "## Open",
    ...(open.length ? open.map(line) : ["_nothing open_"]),
    "",
    "## Done",
    ...(done.length ? done.map(line) : ["_nothing done yet_"]),
    "",
  ].join("\n");
  const vaultPath = await writeVaultFile(["Goals", `goals-${month}.md`], md);
  return { vaultPath };
}

export async function addGoal(text: string, category?: string): Promise<Goal> {
  const goals = await readGoals();
  const goal: Goal = {
    id: newId("goal"),
    text: text.slice(0, 500).trim(),
    category: category?.slice(0, 40).trim() || undefined,
    done: false,
    createdAt: new Date().toISOString(),
  };
  goals.unshift(goal);
  await writeGoals(goals);
  return goal;
}

// ── Journal — one file per day ──────────────────────────────────────────────

export async function readJournal(date: string): Promise<JournalEntry[]> {
  return readJson<JournalEntry[]>(`journal/${date}.json`, []);
}

export async function listJournalDays(limit = 60): Promise<string[]> {
  try {
    const { DATA_DIR } = await import("./store");
    const items = await readdir(path.join(DATA_DIR, "journal"));
    return items
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function appendJournalEntry(
  date: string,
  text: string,
  mood?: string,
): Promise<{ entry: JournalEntry; vaultPath: string | null }> {
  const entries = await readJournal(date);
  const entry: JournalEntry = {
    id: newId("j"),
    text: text.slice(0, 10_000),
    at: new Date().toISOString(),
    mood,
  };
  entries.push(entry);
  await writeJson(`journal/${date}.json`, entries);
  const vaultPath = await syncJournalDay(date, entries);
  return { entry, vaultPath };
}

export async function deleteJournalEntry(date: string, id: string): Promise<JournalEntry[]> {
  const entries = (await readJournal(date)).filter((e) => e.id !== id);
  await writeJson(`journal/${date}.json`, entries);
  await syncJournalDay(date, entries);
  return entries;
}

async function syncJournalDay(date: string, entries: JournalEntry[]): Promise<string | null> {
  const body = entries
    .map((e) => {
      const time = new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `## ${time}${e.mood ? `  ·  ${e.mood}` : ""}\n\n${e.text}\n`;
    })
    .join("\n");
  const md = [`# ${date}`, "", body || "_no entries yet_", ""].join("\n");
  return writeVaultFile(["Journal", `${date}.md`], md);
}

export { monthOf };
