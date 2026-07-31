"use client";

import { useMemo, useState } from "react";
import { useJson } from "@/lib/client";
import type { GraphifyGraph, GraphifyHealth, GraphifyHit, GraphifyNode } from "@/lib/graphify";
import MemoryGraph from "@/components/MemoryGraph";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Stat, Tabs } from "@/components/ui";

const ACCENT = "#a3e635";
const TABS = ["Graph", "Query", "Health", "God nodes"];

interface Payload {
  graph: GraphifyGraph;
  health: GraphifyHealth;
  godNodes: { node: GraphifyNode; importedBy: number }[];
  cachePath: string;
}

const KIND_GROUP: Record<string, string> = {
  route: "routes",
  api: "api",
  component: "components",
  lib: "lib",
  config: "config",
  doc: "docs",
  file: "other",
};

export default function GraphifyPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, refresh } = useJson<Payload>("/api/graphify");
  const { data: queryData } = useJson<{ hits: GraphifyHit[] }>(
    submitted ? `/api/graphify?q=${encodeURIComponent(submitted)}` : null,
  );

  // Reuse the hand-rolled canvas force sim — 2D is the right altitude for a
  // codebase map; 3D stays the memory brain's signature.
  const canvasGraph = useMemo(() => {
    if (!data) return null;
    return {
      nodes: data.graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        group: KIND_GROUP[n.kind] ?? "other",
        size: Math.min(22, 5 + Math.round(n.loc / 120)),
        mtime: data.graph.generatedAt,
      })),
      links: data.graph.edges.map((e) => ({ source: e.source, target: e.target, kind: "wikilink" as const })),
      stats: { notes: data.graph.nodes.length, links: data.graph.edges.length, folders: 0, newest: data.graph.generatedAt },
    };
  }, [data]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="System · Structural brain"
        title="Graphify"
        subtitle="This codebase as a knowledge graph — files classified and wired by real imports. Ask it where something lives instead of scanning the repo."
        accent={ACCENT}
        icon="Waypoints"
        actions={
          <button className="btn" onClick={() => fetch("/api/graphify?refresh=1").then(() => refresh())}>
            <Icon name="RefreshCw" size={13} /> Rebuild
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Files" value={data?.health.nodes ?? "—"} icon="Files" accent={ACCENT} />
        <Stat label="Import edges" value={data?.health.edges ?? "—"} icon="GitBranch" accent="var(--violet)" />
        <Stat label="Avg degree" value={data?.health.avgDegree ?? "—"} icon="Activity" accent="var(--cyan)" />
        <Stat label="Orphans" value={data?.health.orphans ?? "—"} hint="files nothing imports and that import nothing" icon="Unlink" accent="var(--rose)" />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Graph" && (
        <Panel title="Import graph" subtitle={`Scanned ${data?.graph.root ?? "…"} · secrets-shaped paths excluded`} padded={false}>
          {canvasGraph ? <MemoryGraph graph={canvasGraph} /> : <div className="skeleton m-5 h-[440px]" />}
        </Panel>
      )}

      {tab === "Query" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex items-center gap-2">
              <Icon name="Search" size={15} className="text-[var(--fg-mute)]" />
              <input
                className="input !border-0 !bg-transparent !px-0 focus:!shadow-none"
                placeholder="e.g. where is the credentials store written?"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSubmitted(q.trim())}
              />
              <button className="btn btn-primary" onClick={() => setSubmitted(q.trim())}>
                Ask the graph
              </button>
            </div>
          </Panel>
          {submitted &&
            (queryData?.hits.length ? (
              <Panel title={`Ranked files for “${submitted}”`} padded={false}>
                <ul className="divide-y divide-[var(--line)]">
                  {queryData.hits.map((h) => (
                    <li key={h.node.id} className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="pill mono !text-[10px]">{h.node.kind}</span>
                        <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-[var(--fg-soft)]">{h.node.id}</span>
                        <span className="text-[11px] text-[var(--fg-mute)]">{h.node.loc} loc · score {h.score}</span>
                      </div>
                      {(h.importedBy.length > 0 || h.imports.length > 0) && (
                        <p className="mono mt-1 truncate text-[10.5px] text-[var(--fg-mute)]">
                          {h.importedBy.length ? `used by ${h.importedBy.length}: ${h.importedBy.slice(0, 3).join(", ")}` : ""}
                          {h.importedBy.length && h.imports.length ? " · " : ""}
                          {h.imports.length ? `imports ${h.imports.length}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : (
              <Panel><EmptyState icon="SearchX" title="No files matched" /></Panel>
            ))}
        </div>
      )}

      {tab === "Health" && data && (
        <Panel title="Graph health" subtitle={`cache: ${data.cachePath}`} padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {Object.entries(data.health.byKind).map(([kind, n]) => (
              <li key={kind} className="flex items-center justify-between px-5 py-2.5 text-[12.5px]">
                <span className="mono">{kind}</span>
                <span className="text-[var(--fg-dim)]">{n} files</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "God nodes" && data && (
        <Panel title="Most-imported files" subtitle="Where a change ripples widest — review these with extra care" padded={false}>
          {data.godNodes.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {data.godNodes.map((g) => (
                <li key={g.node.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="pill mono !text-[10px]">{g.node.kind}</span>
                  <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-[var(--fg-soft)]">{g.node.id}</span>
                  <span className="text-[11.5px] text-[var(--fg-dim)]">imported by {g.importedBy}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Waypoints" title="No import data yet" />
          )}
        </Panel>
      )}
    </PageShell>
  );
}
