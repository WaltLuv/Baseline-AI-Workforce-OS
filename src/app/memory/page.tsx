"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Search, X } from "lucide-react";
import { useJson } from "@/lib/client";
import type { MemoryGraph as Graph, Note, NoteHit } from "@/lib/memory";
import type { BrainGraph, BrainNode } from "@/lib/brain.server";
import MemoryGraph from "@/components/MemoryGraph";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Stat, StatusPill, Tabs, relTime } from "@/components/ui";

// three + the WebGL force graph load only when the Brain tab is opened.
const Brain3D = dynamic(() => import("@/components/Brain3D"), {
  ssr: false,
  loading: () => <div className="skeleton m-5 h-[520px]" />,
});

interface GraphResponse {
  graph: Graph;
  vault: string | null;
}
interface RecentResponse {
  notes: Note[];
  total: number;
  vault: string | null;
}
interface SearchResponse {
  hits: NoteHit[];
}
interface NoteResponse {
  content: string;
  mtime: number;
  path: string;
  root: string;
}

export default function MemoryPage() {
  const [tab, setTab] = useState("Brain");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [open, setOpen] = useState<{ root: string; path: string } | null>(null);

  const { data: graphData, loading: graphLoading } = useJson<GraphResponse>(tab === "Graph" ? "/api/memory?view=graph" : null);
  const { data: brain, loading: brainLoading } = useJson<BrainGraph>(tab === "Brain" ? "/api/memory/brain" : null);
  const [picked, setPicked] = useState<BrainNode | null>(null);
  const { data: recent } = useJson<RecentResponse>("/api/memory?view=recent");
  const { data: results } = useJson<SearchResponse>(
    submitted ? `/api/memory?view=search&q=${encodeURIComponent(submitted)}` : null,
  );
  const { data: note } = useJson<NoteResponse>(
    open ? `/api/memory?view=note&root=${open.root}&path=${encodeURIComponent(open.path)}` : null,
  );

  const openNote = useCallback((id: string) => {
    const [root, ...rest] = id.split(":");
    if (root !== "vault" && root !== "workforce") return;
    setOpen({ root, path: rest.join(":") });
  }, []);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Command"
        icon="Brain"
        accent="#22d3ee"
        title="Memory"
        subtitle="A live graph of your notes and everything the workforce has written down. Built on this machine, on request."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Notes" value={recent?.total ?? "—"} icon="FileText" accent="#22d3ee" />
        <Stat label="Links" value={graphData?.graph.stats.links ?? "—"} icon="Link" accent="var(--violet)" />
        <Stat
          label="Vault"
          value={recent?.vault ? "Connected" : "Not set"}
          hint={recent?.vault ?? "Add a vault path in Settings"}
          icon="FolderSync"
          accent="var(--gold)"
        />
      </div>

      <Tabs tabs={["Brain", "Graph", "Search", "Recent"]} active={tab} onChange={setTab} />

      {tab === "Brain" && (
        <div className="space-y-4">
          <Panel
            title="3D Brain"
            subtitle="Notes · decisions · sessions · skills · vector stores · Notion — one graph. Amber = stale, red = linked-but-missing."
            padded={false}
          >
            {brainLoading && <div className="skeleton m-5 h-[520px]" />}
            {!brainLoading && brain && brain.nodes.length > 1 ? (
              <div className="p-2">
                <Brain3D graph={brain} onSelect={setPicked} />
              </div>
            ) : (
              !brainLoading && (
                <EmptyState
                  icon="Brain"
                  title="Nothing to visualise yet"
                  body="The brain builds from your vault, journal, Claude sessions and skills — do any of those and it lights up."
                />
              )
            )}
          </Panel>
          {brain && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Sources" padded={false}>
                <ul className="divide-y divide-[var(--line)]">
                  {brain.sources.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="text-[12.5px] text-[var(--fg-soft)]">{s.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--fg-mute)]">{s.detail}</span>
                        <StatusPill
                          ready={s.state === "ok"}
                          label={s.state === "ok" ? "Live" : s.state === "empty" ? "Empty" : s.state === "error" ? "Error" : "Setup needed"}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title={picked ? picked.label : "Signals"}>
                {picked ? (
                  <dl className="space-y-2 text-[12.5px]">
                    <div className="flex justify-between"><dt className="text-[var(--fg-mute)]">Kind</dt><dd>{picked.kind}</dd></div>
                    <div className="flex justify-between"><dt className="text-[var(--fg-mute)]">Status</dt><dd>{picked.status}</dd></div>
                    {picked.detail && <div className="flex justify-between gap-4"><dt className="text-[var(--fg-mute)]">Detail</dt><dd className="mono min-w-0 truncate text-right">{picked.detail}</dd></div>}
                    {picked.mtime > 0 && <div className="flex justify-between"><dt className="text-[var(--fg-mute)]">Touched</dt><dd>{relTime(picked.mtime)}</dd></div>}
                  </dl>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-[var(--fg-mute)]">
                    {brain.stats.notes} notes · {brain.stats.sessions} sessions · {brain.stats.skills} skills ·{" "}
                    {brain.stats.vectorStores} vector stores · {brain.stats.notionPages} Notion pages ·{" "}
                    <span className="text-[#f5b14c]">{brain.stats.stale} stale</span> ·{" "}
                    <span className="text-[#ef5a5a]">{brain.stats.missing} missing</span>. Click a node for detail.
                  </p>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}

      {tab === "Graph" && (
        <Panel title="Note graph" subtitle="Wikilinks solid, folder grouping faint" padded={false}>
          {graphLoading && <div className="skeleton m-5 h-[480px]" />}
          {!graphLoading && graphData?.graph.nodes.length ? (
            <MemoryGraph graph={graphData.graph} onSelect={openNote} />
          ) : (
            !graphLoading && (
              <EmptyState
                icon="Brain"
                title="Nothing to graph yet"
                body="Point Settings at your Obsidian vault, or write a journal entry — both feed this graph."
              />
            )
          )}
        </Panel>
      )}

      {tab === "Search" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex items-center gap-2">
              <Search size={16} className="shrink-0 text-[var(--fg-mute)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSubmitted(query.trim());
                }}
                placeholder="Search every note on this machine…"
                className="input !border-0 !bg-transparent !px-0 focus:!shadow-none"
              />
              <VoiceButton
                size={36}
                onTranscript={(t, o) => {
                  setQuery(t);
                  if (o.final) setSubmitted(t);
                }}
              />
              <button onClick={() => setSubmitted(query.trim())} className="btn btn-primary">
                Search
              </button>
            </div>
          </Panel>

          {submitted && (
            <Panel title={`Results for “${submitted}”`} subtitle={`${results?.hits.length ?? 0} matches`} padded={false}>
              {results?.hits.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {results.hits.map((h) => (
                    <li key={`${h.root}:${h.path}`}>
                      <button
                        onClick={() => setOpen({ root: h.root, path: h.path })}
                        className="w-full px-5 py-3 text-left transition hover:bg-[rgba(244,239,230,0.04)]"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[13.5px] font-medium text-[var(--fg-soft)]">{h.title}</span>
                          <span className="pill !py-0.5 !text-[10px]">{h.root}</span>
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-[var(--fg-mute)]">{h.preview}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="SearchX" title="No matches" />
              )}
            </Panel>
          )}
        </div>
      )}

      {tab === "Recent" && (
        <Panel title="Recently touched" padded={false}>
          {recent?.notes.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {recent.notes.map((n) => (
                <li key={`${n.root}:${n.path}`}>
                  <button
                    onClick={() => setOpen({ root: n.root, path: n.path })}
                    className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition hover:bg-[rgba(244,239,230,0.04)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[var(--fg-soft)]">{n.title}</span>
                      <span className="mono block truncate text-[10.5px] text-[var(--fg-mute)]">{n.path}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(n.mtime)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="FileText" title="No notes found" body="Set a vault path in Settings, or start a journal." />
          )}
        </Panel>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="panel max-h-[80vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
              <span className="mono min-w-0 truncate text-[var(--fg-dim)]">{open.path}</span>
              <button onClick={() => setOpen(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <pre className="scroll max-h-[64vh] overflow-y-auto whitespace-pre-wrap p-5 text-[13px] leading-relaxed text-[var(--fg-soft)]">
              {note?.content ?? "loading…"}
            </pre>
          </div>
        </div>
      )}
    </PageShell>
  );
}
