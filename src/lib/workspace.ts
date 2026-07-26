/**
 * Agent workspace: every build an agent does lands in its own project folder
 * under ~/.baseline-workforce/workspace/<project>/ so nothing an agent writes
 * can land somewhere you did not expect.
 */

import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { loadConfig } from "./config";
import { safeSlug } from "./store";

export function workspaceRoot(): string {
  return loadConfig().workspaceRoot;
}

/** Resolve a project folder, creating it on first use. */
export async function ensureProject(name: string): Promise<string> {
  const slug = safeSlug(name, "project");
  const dir = path.join(workspaceRoot(), slug);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Join inside a project without allowing `..` to escape it. */
export function safeJoin(projectDir: string, rel: string): string | null {
  const abs = path.resolve(projectDir, rel);
  const root = path.resolve(projectDir);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
}

export interface WorkspaceFile {
  rel: string;
  size: number;
  updatedAt: number;
}

export async function listProjects(): Promise<{ name: string; files: number; updatedAt: number }[]> {
  const root = workspaceRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const out: { name: string; files: number; updatedAt: number }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const files = await listFiles(dir);
    const st = await stat(dir).catch(() => null);
    out.push({
      name: e.name,
      files: files.length,
      updatedAt: files.reduce((max, f) => Math.max(max, f.updatedAt), st?.mtimeMs ?? 0),
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

export async function listFiles(projectDir: string, maxDepth = 5): Promise<WorkspaceFile[]> {
  const out: WorkspaceFile[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > maxDepth || out.length > 500) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (e.isFile()) {
        const st = await stat(abs).catch(() => null);
        if (!st) continue;
        out.push({ rel: path.relative(projectDir, abs), size: st.size, updatedAt: st.mtimeMs });
      }
    }
  }
  await walk(projectDir, 0);
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readProjectFile(project: string, rel: string): Promise<string | null> {
  const dir = path.join(workspaceRoot(), safeSlug(project, "project"));
  const abs = safeJoin(dir, rel);
  if (!abs || !existsSync(abs)) return null;
  const st = await stat(abs);
  if (st.size > 2_000_000) return "// file too large to display";
  return readFile(abs, "utf8").catch(() => null);
}

/**
 * Pull fenced code blocks that name a file out of an agent reply and write
 * them into the project. Recognises both of the conventions agents actually
 * use:  ```ts file: src/x.ts   and a `// file: src/x.ts` first line.
 */
export async function extractFiles(project: string, reply: string): Promise<string[]> {
  const dir = await ensureProject(project);
  const written: string[] = [];
  const fence = /```([a-zA-Z0-9]*)[^\S\r\n]*(?:file[:=]\s*)?([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = fence.exec(reply)) !== null) {
    const lang = m[1] ?? "";
    let name = (m[2] ?? "").trim().replace(/^["'`]|["'`]$/g, "");
    let body = m[3] ?? "";

    if (!name) {
      const first = body.split("\n", 1)[0] ?? "";
      const hint = first.match(/^(?:\/\/|#|<!--)\s*file[:=]?\s*(.+?)\s*(?:-->)?$/i);
      if (hint) {
        name = hint[1].trim();
        body = body.slice(first.length + 1);
      }
    }
    if (!name) {
      // An unnamed HTML block is still worth keeping — it is the usual "one file app".
      if (lang === "html" && /<html|<!doctype/i.test(body)) name = "index.html";
      else continue;
    }
    if (name.includes("..") || path.isAbsolute(name)) continue;

    const abs = safeJoin(dir, name);
    if (!abs) continue;
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, body.replace(/\n$/, "") + "\n", "utf8");
    written.push(name);
  }
  return written;
}

const PREVIEWABLE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export function contentTypeFor(rel: string): string | null {
  return PREVIEWABLE[path.extname(rel).toLowerCase()] ?? null;
}
