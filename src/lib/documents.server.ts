/**
 * Documents: a read-only gallery over ~/Documents/Hermes (the Hermes
 * documents drop, same convention as Baseline Agent OS).
 *
 * The source dir is never modified — "delete" is a tombstone in
 * ~/.baseline-workforce/documents/hidden.json that hides a file from the
 * gallery while leaving it untouched on disk. That is a deliberate deviation
 * from the original app (which soft-deleted into a .trash folder): here the
 * read-only rule wins.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { WORKFORCE_HOME } from "./config";

export const DOCUMENTS_DIR = process.env.WORKFORCE_DOCUMENTS_DIR ?? path.join(os.homedir(), "Documents", "Hermes");
const HIDDEN_PATH = path.join(WORKFORCE_HOME, "documents", "hidden.json");

export interface DocumentInfo {
  name: string;
  ext: string;
  size: number;
  updatedAt: number;
  hidden: boolean;
}

function readHidden(): Set<string> {
  try {
    if (!existsSync(HIDDEN_PATH)) return new Set();
    return new Set(JSON.parse(readFileSync(HIDDEN_PATH, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

function writeHidden(hidden: Set<string>): void {
  mkdirSync(path.dirname(HIDDEN_PATH), { recursive: true });
  writeFileSync(HIDDEN_PATH, JSON.stringify([...hidden], null, 2));
}

export function listDocuments(includeHidden = false): { dir: string; exists: boolean; documents: DocumentInfo[] } {
  if (!existsSync(DOCUMENTS_DIR)) return { dir: DOCUMENTS_DIR, exists: false, documents: [] };
  const hidden = readHidden();
  const documents: DocumentInfo[] = [];
  for (const name of readdirSync(DOCUMENTS_DIR)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(DOCUMENTS_DIR, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const isHidden = hidden.has(name);
    if (isHidden && !includeHidden) continue;
    documents.push({
      name,
      ext: path.extname(name).slice(1).toLowerCase(),
      size: st.size,
      updatedAt: st.mtimeMs,
      hidden: isHidden,
    });
  }
  documents.sort((a, b) => b.updatedAt - a.updatedAt);
  return { dir: DOCUMENTS_DIR, exists: true, documents };
}

export function setDocumentHidden(name: string, hide: boolean): void {
  if (name.includes("/") || name.includes("..")) throw new Error("invalid name");
  const hidden = readHidden();
  if (hide) hidden.add(name);
  else hidden.delete(name);
  writeHidden(hidden);
}

/** Absolute path for streaming one document — guarded against escapes. */
export function documentPath(name: string): string | null {
  if (name.includes("/") || name.includes("..")) return null;
  const abs = path.join(DOCUMENTS_DIR, name);
  return existsSync(abs) ? abs : null;
}

const TEXT_EXTS = new Set(["md", "txt", "json", "csv", "yaml", "yml", "log", "html", "ts", "js", "py"]);

export function documentPreview(name: string): { kind: "text"; content: string } | { kind: "binary" } | null {
  const abs = documentPath(name);
  if (!abs) return null;
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return { kind: "binary" };
  const content = readFileSync(abs, "utf8");
  return { kind: "text", content: content.length > 40_000 ? `${content.slice(0, 40_000)}\n… [truncated]` : content };
}
