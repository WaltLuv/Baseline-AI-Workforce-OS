"use client";

import { useRef, useState } from "react";
import { streamNdjson, useBoard, type StreamEvent } from "@/lib/client";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Spinner, Tabs } from "@/components/ui";

const ACCENT = "#fda4af";

interface Brief {
  id: string;
  target: string;
  depth: "overview" | "deep";
  createdAt: number;
  text: string;
}
interface BoardDoc {
  briefs: Brief[];
}

function briefPrompt(target: string, depth: "overview" | "deep"): string {
  return `You are Understand-Anything: turn a repository into a structured knowledge brief.

Target: ${target}
Depth: ${depth}

${target.startsWith("http") ? "Clone or fetch what you need to inspect the repository." : "The target is a local path — read it directly."}

Produce a markdown brief with EXACTLY these sections:
# Overview
(3-5 sentences: what it is, who it's for, what state it's in)
# Architecture
(the major moving parts and how they talk to each other)
# Entry points
(where execution starts: main files, routes, commands)
# Important files
(the 5-10 files that matter most, one line each on why)
# Read this first
(the single best file to read first and why)
# Three questions to ask the maintainer
(the three most revealing questions about this codebase)

${depth === "deep" ? "Go deep: read the key files, quote real function names and line-level facts." : "Stay at overview altitude: structure over line-level detail."}
Base everything on what you actually find — no guessing about code you did not read.`;
}

export default function UnderstandPage() {
  const [tab, setTab] = useState("New brief");
  const [target, setTarget] = useState("");
  const [depth, setDepth] = useState<"overview" | "deep">("overview");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState("");
  const [toolLog, setToolLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const { doc, setDoc, loaded } = useBoard<BoardDoc>("understand", { briefs: [] });
  const [openBrief, setOpenBrief] = useState<Brief | null>(null);

  const run = async () => {
    if (!target.trim() || running) return;
    setRunning(true);
    setLive("");
    setToolLog([]);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      await streamNdjson(
        "/api/run",
        { agent: "claude", prompt: briefPrompt(target.trim(), depth), project: "understand" },
        (evt: StreamEvent) => {
          if ((evt.t === "delta" || evt.t === "final") && evt.text) {
            acc = evt.t === "final" ? evt.text : acc + evt.text;
            setLive(acc);
          } else if (evt.t === "text" && evt.text) {
            acc = evt.text;
            setLive(acc);
          } else if (evt.t === "tool") {
            setToolLog((l) => [...l.slice(-30), `${evt.name} ${evt.detail ?? ""}`.trim()]);
          } else if (evt.t === "err" && evt.text) {
            setToolLog((l) => [...l.slice(-30), `error: ${evt.text}`]);
          }
        },
        ac.signal,
      );
    } catch (e) {
      setToolLog((l) => [...l, `error: ${e instanceof Error ? e.message : String(e)}`]);
    }
    setRunning(false);
    if (acc.trim()) {
      const brief: Brief = {
        id: `b-${Date.now().toString(36)}`,
        target: target.trim(),
        depth,
        createdAt: Date.now(),
        text: acc.trim(),
      };
      setDoc({ briefs: [brief, ...doc.briefs].slice(0, 40) });
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration · Understand-Anything"
        title="Understand"
        subtitle="Point it at a repo URL or a local path and get a structured knowledge brief: overview, architecture, entry points, what to read first, and the three questions worth asking."
        accent={ACCENT}
        icon="Telescope"
      />
      <Tabs tabs={["New brief", "History"]} active={tab} onChange={setTab} />

      {tab === "New brief" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Target" className="lg:col-span-1">
            <div className="space-y-3">
              <input
                className="input w-full"
                placeholder="https://github.com/owner/repo or /path/on/this/machine"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <div className="flex gap-1.5">
                {(["overview", "deep"] as const).map((d) => (
                  <button key={d} className={`btn !px-3 text-[12px] ${depth === d ? "btn-primary" : ""}`} onClick={() => setDepth(d)}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-primary" onClick={() => void run()} disabled={running || !target.trim()}>
                  {running ? <Spinner size={13} /> : <Icon name="Telescope" size={13} />} Understand it
                </button>
                {running && (
                  <button className="btn" onClick={() => abortRef.current?.abort()}>
                    Stop
                  </button>
                )}
              </div>
              {toolLog.length > 0 && (
                <pre className="mono max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-2.5 text-[10.5px] text-[var(--fg-mute)]">
                  {toolLog.join("\n")}
                </pre>
              )}
            </div>
          </Panel>
          <Panel title="Brief" subtitle={running ? "streaming…" : "the finished brief is saved to History automatically"} className="lg:col-span-2">
            {live ? (
              <pre className="scroll max-h-[560px] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--fg-soft)]">{live}</pre>
            ) : (
              <p className="text-[12.5px] text-[var(--fg-mute)]">Nothing yet — point it at a repo and run.</p>
            )}
          </Panel>
        </div>
      )}

      {tab === "History" && (
        <Panel padded={false}>
          {!loaded ? (
            <div className="skeleton m-5 h-32" />
          ) : doc.briefs.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {doc.briefs.map((b) => (
                <li key={b.id}>
                  <button className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[rgba(244,239,230,0.04)]" onClick={() => setOpenBrief(b)}>
                    <span className="pill !text-[10px]">{b.depth}</span>
                    <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-[var(--fg-soft)]">{b.target}</span>
                    <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{new Date(b.createdAt).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Telescope" title="No briefs yet" body="Briefs persist here, on this machine, one per run." />
          )}
        </Panel>
      )}

      {openBrief && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpenBrief(null)}>
          <div className="panel max-h-[82vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
              <span className="mono min-w-0 truncate text-[var(--fg-dim)]">{openBrief.target}</span>
              <button onClick={() => setOpenBrief(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <Icon name="X" size={15} />
              </button>
            </div>
            <pre className="scroll max-h-[66vh] overflow-y-auto whitespace-pre-wrap p-5 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
              {openBrief.text}
            </pre>
          </div>
        </div>
      )}
    </PageShell>
  );
}
