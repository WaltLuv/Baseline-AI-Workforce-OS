/**
 * The Agency — WaltLuv/agency-agents-v2 as a first-class surface.
 *
 * The roster is read from a local clone of the repo (never hardcoded), and
 * installed-state comes from a read-only scan of ~/.claude/agents. The app
 * NEVER writes into ~/.claude — installing agents is the repo's install
 * script's job, and this page hands you the exact command instead.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { firstExisting } from "./config";

export interface AgencyAgent {
  slug: string;
  division: string;
  name: string;
  description: string;
  emoji: string;
  vibe: string;
  installed: boolean;
}

export interface AgencyDivision {
  slug: string;
  label: string;
  icon: string;
  color: string;
  count: number;
  installedCount: number;
}

export interface AgencyOverview {
  repoPath: string | null;
  repoFound: boolean;
  cloneCommand: string;
  installDir: string;
  installedCount: number;
  totalCount: number;
  installCommand: string;
  divisions: AgencyDivision[];
}

const CLONE_CMD = "git clone https://github.com/WaltLuv/agency-agents-v2.git ~/code/agency-agents-v2";
const INSTALL_DIR = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"), "agents");

export function agencyRepoPath(): string | null {
  return firstExisting(
    process.env.WORKFORCE_AGENCY_REPO,
    path.join(os.homedir(), "code", "agency-agents-v2"),
    path.join(os.homedir(), "agency-agents-v2"),
    path.join(os.homedir(), "code", "agency-agents"),
  );
}

function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

interface DivisionMeta {
  label: string;
  icon: string;
  color: string;
}

function divisionMeta(repo: string): Record<string, DivisionMeta> {
  try {
    const raw = JSON.parse(readFileSync(path.join(repo, "divisions.json"), "utf8")) as Record<string, unknown>;
    const out: Record<string, DivisionMeta> = {};
    const source = (raw.divisions ?? raw) as Record<string, unknown>;
    for (const [slug, v] of Object.entries(source)) {
      if (slug.startsWith("_") || !v || typeof v !== "object") continue;
      const d = v as Record<string, unknown>;
      out[slug] = {
        label: String(d.label ?? slug),
        icon: String(d.icon ?? "Users"),
        color: String(d.color ?? "#a78bfa"),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Names + slugs already installed for Claude Code — read-only scan. */
function installedSet(): Set<string> {
  const out = new Set<string>();
  if (!existsSync(INSTALL_DIR)) return out;
  for (const f of readdirSync(INSTALL_DIR)) {
    if (!f.endsWith(".md")) continue;
    out.add(f.replace(/\.md$/, "").toLowerCase());
    try {
      const fm = frontmatter(readFileSync(path.join(INSTALL_DIR, f), "utf8"));
      if (fm.name) out.add(fm.name.toLowerCase());
    } catch {
      /* unreadable file — the filename entry stands */
    }
  }
  return out;
}

function listDivisionAgents(repo: string, division: string, installed: Set<string>): AgencyAgent[] {
  const dir = path.join(repo, division);
  if (!existsSync(dir)) return [];
  const out: AgencyAgent[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const slug = f.replace(/\.md$/, "");
    let fm: Record<string, string> = {};
    try {
      fm = frontmatter(readFileSync(path.join(dir, f), "utf8"));
    } catch {
      continue;
    }
    out.push({
      slug,
      division,
      name: fm.name || slug,
      description: fm.description ?? "",
      emoji: fm.emoji ?? "",
      vibe: fm.vibe ?? "",
      installed: installed.has(slug.toLowerCase()) || installed.has((fm.name ?? "").toLowerCase()),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function agencyOverview(): AgencyOverview {
  const repo = agencyRepoPath();
  if (!repo) {
    return {
      repoPath: null,
      repoFound: false,
      cloneCommand: CLONE_CMD,
      installDir: INSTALL_DIR,
      installedCount: 0,
      totalCount: 0,
      installCommand: "cd ~/code/agency-agents-v2 && ./scripts/install.sh --tool claude-code",
      divisions: [],
    };
  }
  const meta = divisionMeta(repo);
  const installed = installedSet();
  const divisions: AgencyDivision[] = [];
  let total = 0;
  let installedCount = 0;
  const slugs = Object.keys(meta).length
    ? Object.keys(meta)
    : readdirSync(repo).filter((d) => !d.startsWith(".") && existsSync(path.join(repo, d)) && !/scripts|examples|integrations|tools/.test(d));
  for (const slug of slugs) {
    const agents = listDivisionAgents(repo, slug, installed);
    if (!agents.length) continue;
    const inst = agents.filter((a) => a.installed).length;
    total += agents.length;
    installedCount += inst;
    divisions.push({
      slug,
      label: meta[slug]?.label ?? slug.replace(/-/g, " "),
      icon: meta[slug]?.icon ?? "Users",
      color: meta[slug]?.color ?? "#a78bfa",
      count: agents.length,
      installedCount: inst,
    });
  }
  divisions.sort((a, b) => b.count - a.count);
  return {
    repoPath: repo,
    repoFound: true,
    cloneCommand: CLONE_CMD,
    installDir: INSTALL_DIR,
    installedCount,
    totalCount: total,
    installCommand: `cd ${repo} && ./scripts/install.sh --tool claude-code`,
    divisions,
  };
}

export function agencyDivision(division: string): AgencyAgent[] {
  const repo = agencyRepoPath();
  if (!repo || !/^[a-z0-9-]+$/.test(division)) return [];
  return listDivisionAgents(repo, division, installedSet());
}

export function agencyAgentBody(division: string, slug: string): string | null {
  const repo = agencyRepoPath();
  if (!repo || !/^[a-z0-9-]+$/.test(division) || !/^[a-z0-9._-]+$/i.test(slug)) return null;
  const abs = path.join(repo, division, `${slug}.md`);
  if (!existsSync(abs)) return null;
  const text = readFileSync(abs, "utf8");
  return text.length > 60_000 ? `${text.slice(0, 60_000)}\n… [truncated]` : text;
}
