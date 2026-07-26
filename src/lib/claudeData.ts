/**
 * Read-only view over what Claude Code has already done on this machine.
 *
 * Session transcripts live at ~/.claude/projects/<slug>/<session>.jsonl, one
 * JSON object per line. We stream the tail of each file rather than parsing
 * everything, because these grow into the tens of megabytes.
 */

import { readdir, stat, readFile, open } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";

export const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");

export interface SessionSummary {
  id: string;
  project: string;
  projectPath: string;
  file: string;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: number;
  updatedAt: number;
  firstPrompt: string;
  models: string[];
}

/** Read at most `maxBytes` from the end of a file — enough for a fair summary. */
async function readTail(file: string, maxBytes: number): Promise<string> {
  const st = await stat(file);
  if (st.size <= maxBytes) return readFile(file, "utf8");
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    await fh.read(buf, 0, maxBytes, st.size - maxBytes);
    const text = buf.toString("utf8");
    // Drop the partial first line.
    return text.slice(text.indexOf("\n") + 1);
  } finally {
    await fh.close();
  }
}

async function readHead(file: string, maxBytes: number): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.toString("utf8", 0, bytesRead);
  } finally {
    await fh.close();
  }
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as Record<string, unknown>;
        if (block?.type === "text" && typeof block.text === "string") return block.text;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

/**
 * Claude Code encodes a project path by replacing every "/" with "-", which
 * makes the original ambiguous once a folder name contains a dash. Walk the
 * slug against the real filesystem to recover the true path where we can, and
 * fall back to the slug itself when the project lives on another machine.
 */
function decodeProjectSlug(slug: string): string {
  const parts = slug.replace(/^-/, "").split("-").filter(Boolean);
  let dir = "";
  let pending = "";
  for (const part of parts) {
    pending = pending ? `${pending}-${part}` : part;
    const candidate = `${dir}/${pending}`;
    if (existsSync(candidate)) {
      dir = candidate;
      pending = "";
    }
  }
  if (pending) dir = dir ? `${dir}/${pending}` : `/${pending}`;
  return dir || slug;
}

async function summariseSession(projectDir: string, projectSlug: string, fileName: string): Promise<SessionSummary | null> {
  const file = path.join(projectDir, fileName);
  let st;
  try {
    st = await stat(file);
  } catch {
    return null;
  }

  const [head, tail] = await Promise.all([readHead(file, 96_000), readTail(file, 512_000)]);
  const lines = [...new Set([...head.split("\n"), ...tail.split("\n")])].filter((l) => l.trim());

  const projectPath = decodeProjectSlug(projectSlug);
  const summary: SessionSummary = {
    id: fileName.replace(/\.jsonl$/, ""),
    project: path.basename(projectPath) || projectSlug,
    projectPath,
    file,
    messages: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    startedAt: st.birthtimeMs || st.mtimeMs,
    updatedAt: st.mtimeMs,
    firstPrompt: "",
    models: [],
  };

  const models = new Set<string>();
  for (const line of lines) {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    const type = evt.type;
    if (type === "user" || type === "assistant") {
      summary.messages++;
      const message = evt.message as Record<string, unknown> | undefined;
      if (type === "user") {
        summary.userMessages++;
        if (!summary.firstPrompt) {
          const t = textOf(message?.content).replace(/\s+/g, " ").trim();
          if (t && !t.startsWith("<")) summary.firstPrompt = t.slice(0, 180);
        }
      } else {
        summary.assistantMessages++;
        if (typeof message?.model === "string") models.add(message.model);
        const usage = message?.usage as Record<string, unknown> | undefined;
        if (usage) {
          summary.inputTokens += Number(usage.input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0);
          summary.outputTokens += Number(usage.output_tokens ?? 0);
        }
        for (const block of (message?.content as unknown[]) ?? []) {
          if ((block as Record<string, unknown>)?.type === "tool_use") summary.toolCalls++;
        }
      }
    }
    if (typeof evt.timestamp === "string") {
      const ts = Date.parse(evt.timestamp);
      if (!Number.isNaN(ts)) {
        summary.startedAt = Math.min(summary.startedAt, ts);
        summary.updatedAt = Math.max(summary.updatedAt, ts);
      }
    }
    if (typeof evt.costUSD === "number") summary.costUsd += evt.costUSD;
  }

  summary.models = [...models];
  return summary;
}

export async function listSessions(limit = 40): Promise<SessionSummary[]> {
  if (!existsSync(PROJECTS_DIR)) return [];
  let projects: string[];
  try {
    projects = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const candidates: { dir: string; slug: string; file: string; mtime: number }[] = [];
  for (const slug of projects) {
    const dir = path.join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      try {
        const st = await stat(path.join(dir, f));
        candidates.push({ dir, slug, file: f, mtime: st.mtimeMs });
      } catch {
        /* skip */
      }
    }
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  const picked = candidates.slice(0, limit);
  const out = await Promise.all(picked.map((c) => summariseSession(c.dir, c.slug, c.file)));
  return out.filter((s): s is SessionSummary => s !== null);
}

export interface UsageRollup {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byDay: { day: string; tokens: number; messages: number }[];
  projects: { name: string; sessions: number; tokens: number }[];
  models: string[];
}

export function rollup(sessions: SessionSummary[]): UsageRollup {
  const byDay = new Map<string, { tokens: number; messages: number }>();
  const byProject = new Map<string, { sessions: number; tokens: number }>();
  const models = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let messages = 0;
  let toolCalls = 0;
  let costUsd = 0;

  for (const s of sessions) {
    inputTokens += s.inputTokens;
    outputTokens += s.outputTokens;
    messages += s.messages;
    toolCalls += s.toolCalls;
    costUsd += s.costUsd;
    s.models.forEach((m) => models.add(m));

    const day = new Date(s.updatedAt).toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { tokens: 0, messages: 0 };
    d.tokens += s.inputTokens + s.outputTokens;
    d.messages += s.messages;
    byDay.set(day, d);

    const p = byProject.get(s.project) ?? { sessions: 0, tokens: 0 };
    p.sessions += 1;
    p.tokens += s.inputTokens + s.outputTokens;
    byProject.set(s.project, p);
  }

  return {
    totalSessions: sessions.length,
    totalMessages: messages,
    totalToolCalls: toolCalls,
    inputTokens,
    outputTokens,
    costUsd,
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14),
    projects: [...byProject.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 8),
    models: [...models],
  };
}

// ── Skills ──────────────────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
  path: string;
  updatedAt: number;
}

function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

async function skillsIn(dir: string, source: string): Promise<SkillInfo[]> {
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SkillInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, "SKILL.md");
    if (!existsSync(file)) continue;
    try {
      const [md, st] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      const fm = frontmatter(md);
      out.push({
        name: fm.name || e.name,
        description: (fm.description || md.split("\n").find((l) => l.trim() && !l.startsWith("#")) || "").slice(0, 400),
        source,
        path: path.join(dir, e.name),
        updatedAt: st.mtimeMs,
      });
    } catch {
      /* skip unreadable skill */
    }
  }
  return out;
}

export async function listSkills(projectRoot?: string): Promise<SkillInfo[]> {
  const dirs: [string, string][] = [
    [path.join(CLAUDE_HOME, "skills"), "user"],
    [path.join(CLAUDE_HOME, "plugins", "skills"), "plugin"],
  ];
  if (projectRoot) dirs.push([path.join(projectRoot, ".claude", "skills"), "project"]);
  const lists = await Promise.all(dirs.map(([d, s]) => skillsIn(d, s)));
  return lists.flat().sort((a, b) => a.name.localeCompare(b.name));
}

// ── MCP servers ─────────────────────────────────────────────────────────────

export interface McpServer {
  name: string;
  command: string;
  scope: string;
}

export async function listMcpServers(): Promise<McpServer[]> {
  const candidates = [path.join(os.homedir(), ".claude.json"), path.join(CLAUDE_HOME, "settings.json")];
  const out: McpServer[] = [];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const json = JSON.parse(await readFile(file, "utf8")) as {
        mcpServers?: Record<string, { command?: string; args?: string[]; url?: string }>;
      };
      for (const [name, def] of Object.entries(json.mcpServers ?? {})) {
        out.push({
          name,
          command: def.url ?? [def.command, ...(def.args ?? [])].filter(Boolean).join(" "),
          scope: path.basename(file),
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
