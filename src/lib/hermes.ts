/**
 * Hermes on this machine: personas, sessions and memories.
 *
 * The persona files are the one place this app writes outside
 * ~/.baseline-workforce, because a pantheon you cannot edit is a museum. Every
 * write is confined to <hermesHome>/pantheon/personas, and editing an existing
 * persona keeps a .bak of what was there before.
 */

import { readdir, readFile, writeFile, stat, mkdir, rename, unlink, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { loadConfig } from "./config";
import { safeSlug } from "./store";

export function hermesHome(): string {
  const fromEnv = process.env.HERMES_HOME?.trim();
  if (fromEnv) return fromEnv;
  const fromCfg = (loadConfig() as unknown as { hermesHome?: string }).hermesHome;
  if (fromCfg) return fromCfg;
  return path.join(os.homedir(), ".hermes");
}

export function personaDir(): string {
  return path.join(hermesHome(), "pantheon", "personas");
}

export interface Persona {
  /** File name without extension — the stable id. */
  slug: string;
  name: string;
  role: string;
  model: string;
  temperature: number | null;
  systemPrompt: string;
  tags: string[];
  file: string;
  updatedAt: number;
  /** Anything in the YAML we did not model, preserved on save. */
  extra: Record<string, unknown>;
}

const KNOWN = new Set(["name", "role", "model", "temperature", "system_prompt", "system", "prompt", "tags", "description"]);

function toPersona(slug: string, file: string, raw: unknown, updatedAt: number): Persona {
  const doc = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) if (!KNOWN.has(k)) extra[k] = v;

  return {
    slug,
    name: String(doc.name ?? slug),
    role: String(doc.role ?? doc.description ?? ""),
    model: String(doc.model ?? ""),
    temperature: typeof doc.temperature === "number" ? doc.temperature : null,
    systemPrompt: String(doc.system_prompt ?? doc.system ?? doc.prompt ?? ""),
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    file,
    updatedAt,
    extra,
  };
}

export async function listPersonas(): Promise<Persona[]> {
  const dir = personaDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir).catch(() => []);
  const out: Persona[] = [];

  for (const name of entries) {
    if (!/\.(ya?ml|json)$/i.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const [text, st] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      const raw = /\.json$/i.test(name) ? JSON.parse(text) : yamlLoad(text);
      out.push(toPersona(name.replace(/\.(ya?ml|json)$/i, ""), file, raw, st.mtimeMs));
    } catch {
      // A malformed persona should show up as broken, not vanish.
      out.push({
        slug: name.replace(/\.(ya?ml|json)$/i, ""),
        name,
        role: "could not be parsed — open the file to fix it",
        model: "",
        temperature: null,
        systemPrompt: "",
        tags: ["unreadable"],
        file: path.join(dir, name),
        updatedAt: 0,
        extra: {},
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function personaPath(slug: string): string {
  const safe = safeSlug(slug, "persona");
  const dir = personaDir();
  const abs = path.resolve(dir, `${safe}.yaml`);
  if (!abs.startsWith(`${path.resolve(dir)}${path.sep}`)) throw new Error("bad persona name");
  return abs;
}

export interface PersonaInput {
  slug?: string;
  name: string;
  role?: string;
  model?: string;
  temperature?: number | null;
  systemPrompt?: string;
  tags?: string[];
}

export async function savePersona(input: PersonaInput): Promise<Persona> {
  if (!input.name?.trim()) throw new Error("a persona needs a name");
  const slug = safeSlug(input.slug || input.name, "persona");
  const file = personaPath(slug);
  await mkdir(path.dirname(file), { recursive: true });

  // Keep whatever the existing file had that we do not model.
  let extra: Record<string, unknown> = {};
  if (existsSync(file)) {
    await copyFile(file, `${file}.bak`).catch(() => {});
    try {
      const current = yamlLoad(await readFile(file, "utf8"));
      extra = toPersona(slug, file, current, 0).extra;
    } catch {
      /* unreadable previous version — the .bak has it */
    }
  }

  const doc: Record<string, unknown> = {
    name: input.name.trim(),
    ...(input.role?.trim() ? { role: input.role.trim() } : {}),
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
    ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.systemPrompt?.trim() ? { system_prompt: input.systemPrompt.trim() } : {}),
    ...extra,
  };

  const body = yamlDump(doc, { lineWidth: 100, noRefs: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, file);

  const st = await stat(file);
  return toPersona(slug, file, doc, st.mtimeMs);
}

export async function deletePersona(slug: string): Promise<void> {
  const file = personaPath(slug);
  if (!existsSync(file)) return;
  // Never a hard delete: rename out of the way so Hermes stops loading it but
  // the content is still recoverable.
  await rename(file, `${file}.deleted-${Date.now()}`).catch(async () => {
    await unlink(file).catch(() => {});
  });
}

// ── Sessions and memories (read-only) ───────────────────────────────────────

export interface HermesSession {
  id: string;
  file: string;
  updatedAt: number;
  size: number;
  preview: string;
}

async function readDirFiles(dir: string, limit: number): Promise<HermesSession[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((e) => e.isFile());
  const out: HermesSession[] = [];

  for (const e of files) {
    const file = path.join(dir, e.name);
    const st = await stat(file).catch(() => null);
    if (!st) continue;
    let preview = "";
    try {
      const head = (await readFile(file, "utf8")).slice(0, 600);
      preview = head.replace(/\s+/g, " ").trim().slice(0, 220);
    } catch {
      preview = "(unreadable)";
    }
    out.push({ id: e.name, file, updatedAt: st.mtimeMs, size: st.size, preview });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function listSessions(limit = 30): Promise<HermesSession[]> {
  return readDirFiles(path.join(hermesHome(), "sessions"), limit);
}

export async function listMemories(limit = 40): Promise<HermesSession[]> {
  return readDirFiles(path.join(hermesHome(), "memories"), limit);
}

export interface HermesOverview {
  home: string;
  exists: boolean;
  personas: number;
  sessions: number;
  memories: number;
  soul: string | null;
}

export async function overview(): Promise<HermesOverview> {
  const home = hermesHome();
  const soulPath = path.join(home, "SOUL.md");
  const [personas, sessions, memories] = await Promise.all([listPersonas(), listSessions(200), listMemories(200)]);
  let soul: string | null = null;
  if (existsSync(soulPath)) {
    soul = await readFile(soulPath, "utf8").then((s) => s.slice(0, 4000)).catch(() => null);
  }
  return {
    home,
    exists: existsSync(home),
    personas: personas.length,
    sessions: sessions.length,
    memories: memories.length,
    soul,
  };
}
