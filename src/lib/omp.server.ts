/**
 * Read-only view of the Oh My Pi harness on this machine (~/.omp).
 *
 * The sessions/ and hindsight/ formats are not formally documented, so this
 * reports their presence and file counts only — no guessed parsing. Nothing
 * here ever writes to ~/.omp.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { AGENT_BY_ID } from "./agents";
import { resolveBin } from "./agents.server";
import { HOME } from "./config";

export const OMP_HOME = process.env.OMP_HOME ?? path.join(HOME, ".omp");

/** Provider env keys omp can run against — any one is enough. */
export const OMP_PROVIDER_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "XAI_API_KEY",
  "CEREBRAS_API_KEY",
] as const;

export interface OmpDirInfo {
  label: string;
  relPath: string;
  exists: boolean;
  fileCount: number;
  note?: string;
}

export interface OmpSkill {
  name: string;
  description: string;
  updatedAt: number;
}

export interface OmpOverview {
  installed: boolean;
  bin: string | null;
  configRoot: string;
  configRootExists: boolean;
  providerKeys: { key: string; present: boolean }[];
  /** installed AND at least one provider key — omp's own definition of runnable. */
  needsSetup: boolean;
  dirs: OmpDirInfo[];
  skills: OmpSkill[];
  agentsMd: string | null;
  systemMd: string | null;
  modelsYml: string | null;
  install: string;
}

function countFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => !f.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function readCapped(p: string, cap = 20_000): string | null {
  try {
    if (!existsSync(p)) return null;
    const text = readFileSync(p, "utf8");
    return text.length > cap ? `${text.slice(0, cap)}\n… [truncated]` : text;
  } catch {
    return null;
  }
}

function listSkills(): OmpSkill[] {
  const dir = path.join(OMP_HOME, "skills");
  if (!existsSync(dir)) return [];
  const out: OmpSkill[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    try {
      const st = statSync(full);
      let description = "";
      if (st.isDirectory()) {
        const skillMd = path.join(full, "SKILL.md");
        const text = readCapped(skillMd, 2_000) ?? "";
        const descLine = /description:\s*(.+)/i.exec(text)?.[1] ?? text.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
        description = (descLine ?? "").trim().slice(0, 160);
      }
      out.push({ name: entry, description, updatedAt: st.mtimeMs });
    } catch {
      /* unreadable entry — skip, don't fail the page */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ompOverview(): OmpOverview {
  const spec = AGENT_BY_ID.ohmypi;
  const bin = spec ? resolveBin(spec) : null;
  const providerKeys = OMP_PROVIDER_KEYS.map((key) => ({ key, present: Boolean(process.env[key]) }));
  const anyKey = providerKeys.some((k) => k.present);

  const dirs: OmpDirInfo[] = [
    { label: "Models config", relPath: "agent/models.yml", exists: existsSync(path.join(OMP_HOME, "agent", "models.yml")), fileCount: 0 },
    { label: "Agent instructions", relPath: "agent/AGENTS.md", exists: existsSync(path.join(OMP_HOME, "agent", "AGENTS.md")), fileCount: 0 },
    { label: "System prompt", relPath: "agent/SYSTEM.md", exists: existsSync(path.join(OMP_HOME, "agent", "SYSTEM.md")), fileCount: 0 },
    {
      label: "Skills",
      relPath: "skills/",
      exists: existsSync(path.join(OMP_HOME, "skills")),
      fileCount: countFiles(path.join(OMP_HOME, "skills")),
    },
    {
      label: "Sessions",
      relPath: "sessions/",
      exists: existsSync(path.join(OMP_HOME, "sessions")),
      fileCount: countFiles(path.join(OMP_HOME, "sessions")),
      note: "format undocumented — shown as presence only, never parsed",
    },
    {
      label: "Hindsight",
      relPath: "hindsight/",
      exists: existsSync(path.join(OMP_HOME, "hindsight")),
      fileCount: countFiles(path.join(OMP_HOME, "hindsight")),
      note: "format undocumented — shown as presence only, never parsed",
    },
  ];

  return {
    installed: Boolean(bin),
    bin,
    configRoot: OMP_HOME,
    configRootExists: existsSync(OMP_HOME),
    providerKeys,
    needsSetup: !bin || !anyKey,
    dirs,
    skills: listSkills(),
    agentsMd: readCapped(path.join(OMP_HOME, "agent", "AGENTS.md")),
    systemMd: readCapped(path.join(OMP_HOME, "agent", "SYSTEM.md")),
    modelsYml: readCapped(path.join(OMP_HOME, "agent", "models.yml")),
    install: spec?.install ?? "curl -fsSL https://omp.sh/install | sh",
  };
}
