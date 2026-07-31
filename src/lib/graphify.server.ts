/**
 * Graphify scanner: walks this app's own source, wires files by import
 * statements, and caches the result under the app home (never inside the
 * repo — the app writes only to ~/.baseline-workforce).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WORKFORCE_HOME } from "./config";
import { GRAPH_EXCLUDE, classify, type GraphifyGraph, type GraphifyNode } from "./graphify";

const CACHE_DIR = path.join(WORKFORCE_HOME, "graphify");
const CACHE_PATH = path.join(CACHE_DIR, "graph.json");
const CACHE_TTL = 10 * 60_000;

/** The app's own project root (apps/workforce when run normally). */
function projectRoot(): string {
  return process.cwd();
}

function walk(dir: string, root: string, out: string[], depth = 0): void {
  if (depth > 8 || out.length > 3000) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs);
    if (GRAPH_EXCLUDE.test(rel) || e.name.startsWith(".")) continue;
    if (e.isDirectory()) walk(abs, root, out, depth + 1);
    else if (/\.(ts|tsx|js|mjs|css|md)$/.test(e.name)) out.push(rel);
  }
}

const IMPORT_RE = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(fromRel: string, spec: string, known: Set<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(fromRel), spec);
  else return null; // external package
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  for (const c of candidates) {
    const norm = path.normalize(c);
    if (known.has(norm)) return norm;
  }
  return null;
}

export function buildGraphify(): GraphifyGraph {
  const root = projectRoot();
  const files: string[] = [];
  for (const top of ["src", "next.config.ts", "package.json"]) {
    const abs = path.join(root, top);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) walk(abs, root, files);
    else files.push(top);
  }

  const known = new Set(files.map((f) => path.normalize(f)));
  const nodes: GraphifyNode[] = [];
  const edges: { source: string; target: string }[] = [];

  for (const rel of files) {
    let loc = 0;
    let content = "";
    try {
      content = readFileSync(path.join(root, rel), "utf8");
      loc = content.split("\n").length;
    } catch {
      continue;
    }
    nodes.push({ id: rel, label: path.basename(rel), kind: classify(rel), loc });
    if (/\.(ts|tsx|js|mjs)$/.test(rel)) {
      const seen = new Set<string>();
      for (const m of content.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        if (!spec) continue;
        const target = resolveImport(rel, spec, known);
        if (target && target !== rel && !seen.has(target)) {
          seen.add(target);
          edges.push({ source: rel, target });
        }
      }
    }
  }

  const graph: GraphifyGraph = { nodes, edges, generatedAt: Date.now(), root };
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(graph));
  } catch {
    /* cache is an optimisation, not a requirement */
  }
  return graph;
}

export function loadGraphify(refresh = false): GraphifyGraph {
  if (!refresh && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as GraphifyGraph;
      if (Date.now() - cached.generatedAt < CACHE_TTL) return cached;
    } catch {
      /* fall through to rebuild */
    }
  }
  return buildGraphify();
}

export const GRAPHIFY_CACHE_PATH = CACHE_PATH;
