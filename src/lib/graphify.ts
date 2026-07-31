/**
 * Graphify — the structural brain: a knowledge graph of this codebase.
 *
 * Client-safe types + pure helpers. Scanning and caching live in
 * graphify.server.ts. Ported from the Baseline Agent OS graphify engine:
 * classify files into kinds, wire them by imports, answer "where is X?"
 * without reading the whole repo.
 */

export type GraphifyKind = "route" | "api" | "component" | "lib" | "config" | "doc" | "file";

export interface GraphifyNode {
  id: string; // repo-relative path
  label: string;
  kind: GraphifyKind;
  /** Lines of code — a rough weight. */
  loc: number;
}

export interface GraphifyEdge {
  source: string;
  target: string;
}

export interface GraphifyGraph {
  nodes: GraphifyNode[];
  edges: GraphifyEdge[];
  generatedAt: number;
  root: string;
}

export interface GraphifyHealth {
  nodes: number;
  edges: number;
  byKind: Record<string, number>;
  orphans: number;
  avgDegree: number;
}

export interface GraphifyHit {
  node: GraphifyNode;
  score: number;
  /** Direct dependencies and dependents, so an agent can open exactly the right files. */
  imports: string[];
  importedBy: string[];
}

/** Never let anything secret-shaped into the graph. */
export const GRAPH_EXCLUDE = /\.env|\.key$|\.pem$|secret|credentials\.local|token|node_modules|\.next|\.git/i;

export function classify(rel: string): GraphifyKind {
  if (/^src\/app\/api\/.*route\.tsx?$/.test(rel)) return "api";
  if (/^src\/app\/.*(page|layout)\.tsx?$/.test(rel)) return "route";
  if (/^src\/components\//.test(rel)) return "component";
  if (/^src\/lib\//.test(rel)) return "lib";
  if (/\.(md|mdx)$/i.test(rel)) return "doc";
  if (/(config|tsconfig|package)\.(ts|js|json)$/.test(rel)) return "config";
  return "file";
}

export function graphHealth(graph: GraphifyGraph): GraphifyHealth {
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const byKind: Record<string, number> = {};
  for (const n of graph.nodes) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    byKind,
    orphans: graph.nodes.filter((n) => !degree.has(n.id)).length,
    avgDegree: graph.nodes.length ? Number(((graph.edges.length * 2) / graph.nodes.length).toFixed(2)) : 0,
  };
}

/** The most-imported files — where a change ripples widest. */
export function godNodes(graph: GraphifyGraph, top = 10): { node: GraphifyNode; importedBy: number }[] {
  const inDeg = new Map<string, number>();
  for (const e of graph.edges) inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  return [...inDeg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([id, importedBy]) => ({ node: graph.nodes.find((n) => n.id === id) as GraphifyNode, importedBy }))
    .filter((x) => x.node);
}

export function queryGraph(graph: GraphifyGraph, q: string, limit = 12): GraphifyHit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: GraphifyHit[] = [];
  for (const node of graph.nodes) {
    const hay = `${node.id} ${node.label} ${node.kind}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (node.label.toLowerCase() === t) score += 10;
      else if (node.label.toLowerCase().includes(t)) score += 5;
      else if (hay.includes(t)) score += 2;
    }
    if (!score) continue;
    hits.push({
      node,
      score,
      imports: graph.edges.filter((e) => e.source === node.id).map((e) => e.target),
      importedBy: graph.edges.filter((e) => e.target === node.id).map((e) => e.source),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
