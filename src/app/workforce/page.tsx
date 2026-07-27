"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, ExternalLink, Play, Plus, Save, Sparkles, Square, Trash2, Wrench } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import type { RunRecord, WorkforceAgent, WorkforceOverview } from "@/lib/workforce";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Spinner, Stat, Tabs, relTime } from "@/components/ui";

interface Response {
  agents: WorkforceAgent[];
  overview: WorkforceOverview;
  runs: RunRecord[];
}

const BLANK = {
  slug: "",
  name: "",
  spec: `# Agent: <name>

## Mission
<One sentence. If it needs "and" twice, it is two agents.>

## Trigger
## Inputs
## Outputs

## Rules
1. Never invent a fact.
2. Never state policy or pricing that is not in knowledge/.

## Limits
## Escalation — stop and hand to a human when
## Definition of done
`,
  contract: `# Prompt contract — <name>

## Output format — exactly these fields, in this order

## Where the output goes

## Hard rules
- Every fact must trace to the input or to a file you read. If it does neither,
  write "not stated".

## Log line format
`,
  tests: `# Ten-case test — <name>

| # | Kind | Input | Pass condition | Result |
|---|---|---|---|---|
| 1 | Normal | | | |
| 6 | Incomplete | | Does NOT invent the missing detail | |
| 10 | Escalation | | Escalated, nothing drafted | |
`,
};

const ENGINES = AGENTS.filter((a) => a.buildsFiles);

export default function WorkforcePage() {
  const { data, refresh } = useJson<Response>("/api/workforce");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [tab, setTab] = useState("Run");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  // Run state
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [engine, setEngine] = useState("claude");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<{ name: string; detail: string }[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [streamId, setStreamId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const agents = data?.agents ?? [];
  const agent = agents.find((a) => a.slug === selected) ?? agents[0] ?? null;
  const composed = interim ? `${input} ${interim}`.trim() : input;

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [output]);

  useEffect(() => {
    if (agent && !selected) setSelected(agent.slug);
  }, [agent, selected]);

  const installStarter = useCallback(async () => {
    setInstalling(true);
    setError(null);
    const res = await fetch("/api/workforce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install-starter" }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string };
    setInstalling(false);
    if (!res?.ok) setError(json.error ?? "could not install the starter workforce");
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/workforce", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string; agent?: WorkforceAgent };
    setSaving(false);
    if (!res?.ok) {
      setError(json.error ?? "could not save");
      return;
    }
    setDraft(null);
    if (json.agent) setSelected(json.agent.slug);
    void refresh();
  }, [draft, refresh]);

  const retire = useCallback(
    async (slug: string) => {
      await fetch(`/api/workforce?agent=${encodeURIComponent(slug)}`, { method: "DELETE" }).catch(() => {});
      setSelected(null);
      setDraft(null);
      void refresh();
    },
    [refresh],
  );

  const run = useCallback(async () => {
    const text = composed.trim();
    if (!agent || !text || busy) return;

    setBusy(true);
    setOutput("");
    setTools([]);
    setFiles([]);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";

    const onEvent = (evt: StreamEvent) => {
      switch (evt.t) {
        case "meta":
          setStreamId(evt.streamId ?? "");
          break;
        case "delta":
        case "final":
          full += evt.text ?? "";
          setOutput(full);
          break;
        case "tool":
          setTools((t) => [...t, { name: evt.name ?? "tool", detail: evt.detail ?? "" }].slice(-40));
          break;
        case "files":
          setFiles(evt.files ?? []);
          break;
        case "err":
          setError(evt.text ?? "");
          break;
        default:
          break;
      }
    };

    try {
      await streamNdjson("/api/workforce/run", { agent: agent.slug, input: text, engine }, onEvent, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    }

    setBusy(false);
    setInput("");
    setInterim("");
    abortRef.current = null;
    void refresh();
  }, [agent, busy, composed, engine, refresh]);

  const stop = useCallback(async () => {
    if (streamId) {
      await fetch(`/api/agents/${engine}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId }),
      }).catch(() => {});
    }
    abortRef.current?.abort();
    setBusy(false);
  }, [engine, streamId]);

  const runs = (data?.runs ?? []).filter((r) => !agent || r.agent === agent.slug);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="Users"
        accent="#e0b184"
        title="Workforce"
        subtitle="Agents you define, not CLIs you connect. Each one is a spec, a contract and its tests — plain files you can export, hand over, and sell."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/workforce/export" className="btn">
              <Download size={14} /> Export pack
            </a>
            <button onClick={() => setDraft({ ...BLANK })} className="btn btn-primary">
              <Plus size={14} /> New agent
            </button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agents" value={data?.overview.agents ?? "—"} icon="Users" accent="var(--gold)" />
        <Stat label="Open items" value={data?.overview.openItems ?? "—"} hint="in state/open-items.md" icon="Inbox" accent="var(--cyan)" />
        <Stat label="Drafts waiting" value={data?.overview.drafts ?? "—"} hint="outbox/ — none sent" icon="FileText" accent="var(--violet)" />
        <Stat label="Briefs" value={data?.overview.briefs ?? "—"} icon="Newspaper" accent="var(--emerald)" />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/25 bg-rose-500/6 px-3.5 py-2.5 text-[12.5px] text-rose-200">{error}</p>
      )}

      {!agents.length && !draft && (
        <Panel className="mb-5">
          <EmptyState
            icon="Users"
            title="No agents yet"
            body="Install the Operations Coordinator Workforce — Intake and Triage, Follow-Up and Coordination, and the Daily Operations Brief — with their specs, contracts and test sheets ready to adapt."
          />
          <div className="flex justify-center pb-2">
            <button onClick={() => void installStarter()} disabled={installing} className="btn btn-primary">
              {installing ? <Spinner /> : <Sparkles size={14} />} Install starter workforce
            </button>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-[var(--fg-mute)]">
            Nothing is overwritten — existing files are left exactly as they are.
          </p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        {/* Roster */}
        <Panel title="Agents" padded={false}>
          {agents.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {agents.map((a) => (
                <li key={a.slug}>
                  <button
                    onClick={() => {
                      setSelected(a.slug);
                      setDraft(null);
                      setOutput("");
                      setFiles([]);
                    }}
                    className="w-full px-4 py-3 text-left transition hover:bg-[rgba(244,239,230,0.04)]"
                    style={{ background: agent?.slug === a.slug ? "rgba(244,239,230,0.05)" : undefined }}
                  >
                    <span className="block truncate text-[13px] font-medium">{a.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--fg-mute)]">
                      {a.runs} run{a.runs === 1 ? "" : "s"}
                      {a.updatedAt ? ` · ${relTime(a.updatedAt)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-[12px] text-[var(--fg-mute)]">None yet.</p>
          )}
          {agents.length > 0 && (
            <div className="border-t border-[var(--line)] px-4 py-3">
              <button onClick={() => void installStarter()} disabled={installing} className="btn btn-ghost !px-2 text-[11.5px]">
                {installing ? <Spinner size={11} /> : <Sparkles size={12} />} Add missing starters
              </button>
            </div>
          )}
        </Panel>

        {/* Editor / runner */}
        <div className="space-y-4">
          {draft ? (
            <Panel
              title={draft.slug ? `Edit ${draft.slug}` : "New agent"}
              actions={
                <div className="flex items-center gap-2">
                  <button onClick={() => setDraft(null)} className="btn btn-ghost !px-2 text-[12px]">
                    Cancel
                  </button>
                  <button onClick={() => void save()} disabled={saving} className="btn btn-primary !py-1.5 text-[12.5px]">
                    {saving ? <Spinner /> : <Save size={13} />} Save
                  </button>
                </div>
              }
            >
              <label className="eyebrow mb-1.5 block" htmlFor="wf-name">
                Name
              </label>
              <input
                id="wf-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Intake and Triage"
                className="input mb-4 py-2 text-[13px]"
              />

              <label className="eyebrow mb-1.5 block" htmlFor="wf-spec">
                AGENT.md — the specification a human reads
              </label>
              <textarea
                id="wf-spec"
                rows={12}
                value={draft.spec}
                onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
                className="textarea mono mb-4 py-2"
              />

              <label className="eyebrow mb-1.5 block" htmlFor="wf-contract">
                CONTRACT.md — what the model reads at run time
              </label>
              <textarea
                id="wf-contract"
                rows={12}
                value={draft.contract}
                onChange={(e) => setDraft({ ...draft, contract: e.target.value })}
                className="textarea mono mb-4 py-2"
              />

              <label className="eyebrow mb-1.5 block" htmlFor="wf-tests">
                tests/cases.md — ten cases, pass conditions written first
              </label>
              <textarea
                id="wf-tests"
                rows={8}
                value={draft.tests}
                onChange={(e) => setDraft({ ...draft, tests: e.target.value })}
                className="textarea mono py-2"
              />
            </Panel>
          ) : agent ? (
            <>
              <Panel
                title={agent.name}
                subtitle={agent.mission || "no mission line in the spec"}
                actions={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setDraft({
                          slug: agent.slug,
                          name: agent.name,
                          spec: agent.spec,
                          contract: agent.contract,
                          tests: agent.tests,
                        })
                      }
                      className="btn btn-ghost !px-2 text-[12px]"
                    >
                      Edit
                    </button>
                    <button onClick={() => void retire(agent.slug)} className="btn btn-ghost !px-2 text-rose-300" title="Retire (kept on disk)">
                      <Trash2 size={13} />
                    </button>
                  </div>
                }
                padded={false}
              >
                <div className="px-5 pt-4">
                  <Tabs tabs={["Run", "Spec", "Contract", "Tests", "History"]} active={tab} onChange={setTab} />
                </div>

                <div className="px-5 pb-5">
                  {tab === "Run" && (
                    <>
                      <label className="eyebrow mb-1.5 block" htmlFor="wf-input">
                        Input
                      </label>
                      <textarea
                        id="wf-input"
                        rows={4}
                        value={composed}
                        onChange={(e) => {
                          setInterim("");
                          setInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
                        }}
                        placeholder="Paste a real message, form submission or call note…"
                        className="textarea py-2 text-[13.5px]"
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                        <div className="flex items-center gap-2">
                          <VoiceButton
                            size={38}
                            title="Dictate the input"
                            onTranscript={(t, o) => {
                              if (o.final) {
                                setInterim("");
                                setInput((prev) => (prev ? `${prev} ${t}` : t));
                              } else {
                                setInterim(t);
                              }
                            }}
                          />
                          <select value={engine} onChange={(e) => setEngine(e.target.value)} className="input !w-auto py-1.5 text-[12.5px]" aria-label="Engine">
                            {ENGINES.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {busy ? (
                          <button onClick={() => void stop()} className="btn text-rose-200">
                            <Square size={13} /> Stop
                          </button>
                        ) : (
                          <button onClick={() => void run()} disabled={!composed.trim()} className="btn btn-primary">
                            <Play size={14} /> Run agent
                          </button>
                        )}
                      </div>

                      {!!tools.length && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {tools.slice(-8).map((t, i) => (
                            <span key={`${t.name}-${i}`} className="pill" title={t.detail}>
                              <Wrench size={10} />
                              {t.name}
                              {t.detail && <span className="max-w-[200px] truncate text-[var(--fg-mute)]">{t.detail}</span>}
                            </span>
                          ))}
                        </div>
                      )}

                      {(busy || output) && (
                        <pre ref={outRef} className="scroll mono mt-4 max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--fg-soft)]">
                          {output || "working…"}
                        </pre>
                      )}

                      {!!files.length && (
                        <div className="mt-4">
                          <p className="eyebrow mb-2">Files touched</p>
                          <ul className="space-y-1">
                            {files.map((f) => (
                              <li key={f}>
                                <a
                                  href={`/api/preview/workforce/${f}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mono text-[12px] text-[var(--gold)] underline decoration-dotted"
                                >
                                  {f} <ExternalLink size={10} className="inline" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}

                  {tab === "Spec" && <pre className="scroll mono max-h-[520px] overflow-y-auto whitespace-pre-wrap text-[var(--fg-soft)]">{agent.spec}</pre>}
                  {tab === "Contract" && <pre className="scroll mono max-h-[520px] overflow-y-auto whitespace-pre-wrap text-[var(--fg-soft)]">{agent.contract}</pre>}
                  {tab === "Tests" && (
                    <pre className="scroll mono max-h-[520px] overflow-y-auto whitespace-pre-wrap text-[var(--fg-soft)]">
                      {agent.tests || "No test sheet yet. Edit the agent to add one — ten cases, pass conditions written first."}
                    </pre>
                  )}

                  {tab === "History" && (
                    <AnimatePresence initial={false}>
                      {runs.length ? (
                        <ul className="divide-y divide-[var(--line)]">
                          {runs.map((r) => (
                            <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-[12.5px] text-[var(--fg-soft)]">{r.input.slice(0, 90)}</span>
                                <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">
                                  {relTime(r.at)}
                                  {r.costUsd > 0 ? ` · $${r.costUsd.toFixed(4)}` : ""}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--fg-mute)]">{r.output.slice(0, 200)}</p>
                            </motion.li>
                          ))}
                        </ul>
                      ) : (
                        <EmptyState icon="History" title="No runs yet" body="Every run is recorded here with what it cost and which files it touched." />
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </Panel>

              <p className="px-1 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
                This agent is a folder of markdown at{" "}
                <span className="mono">~/.baseline-workforce/workspace/workforce/agents/{agent.slug}/</span>. Export the pack
                to hand the whole system to a client as one file — the files are the system, not a database export.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
