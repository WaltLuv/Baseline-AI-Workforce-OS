"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Play, Square, Trash2, Wrench } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import type { FeatureStatus } from "@/lib/features";
import { streamNdjson, useBoard, useJson, type StreamEvent } from "@/lib/client";
import VoiceButton from "./VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, SetupNeeded, Spinner, Tabs, relTime } from "./ui";

export interface StudioOption {
  key: string;
  label: string;
  /** Rendered as a select when `choices` is present, otherwise a text input. */
  choices?: string[];
  placeholder?: string;
  defaultValue?: string;
}

export interface StudioRun {
  id: string;
  brief: string;
  options: Record<string, string>;
  at: number;
  project: string;
  files: string[];
  text: string;
  agent: string;
}

interface Props {
  featureId: string;
  boardName: string;
  project: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  /** Turns the brief + options into the prompt actually sent to the agent. */
  buildPrompt: (brief: string, options: Record<string, string>) => string;
  options?: StudioOption[];
  placeholder: string;
  examples?: string[];
  /** File to open in the preview pane when the run produces one. */
  previewHint?: (files: string[]) => string | null;
  /** Extra copy under the composer. */
  note?: string;
  /**
   * A second tab beside the local studio — used for the render integrations
   * (HeyGen, Suno, an image model), which are a different job from writing the
   * brief and deserve their own space rather than being bolted onto it.
   */
  secondary?: { label: string; node: ReactNode };
  /** Label for the studio's own tab when a secondary one exists. */
  primaryLabel?: string;
}

interface FeaturesResponse {
  statuses: FeatureStatus[];
}

const CAPABLE_AGENTS = AGENTS.filter((a) => a.buildsFiles).map((a) => a.id);

export default function BuildStudio({
  featureId,
  boardName,
  project,
  eyebrow,
  title,
  subtitle,
  icon,
  accent,
  buildPrompt,
  options = [],
  placeholder,
  examples = [],
  previewHint,
  note,
  secondary,
  primaryLabel = "Studio",
}: Props) {
  const [pane, setPane] = useState(primaryLabel);
  const { data: features } = useJson<FeaturesResponse>("/api/features");
  const status = features?.statuses.find((s) => s.id === featureId);

  const { doc, setDoc } = useBoard<{ runs: StudioRun[] }>(boardName, { runs: [] });
  const [brief, setBrief] = useState("");
  const [interim, setInterim] = useState("");
  const [agent, setAgent] = useState("claude");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(options.map((o) => [o.key, o.defaultValue ?? o.choices?.[0] ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [tools, setTools] = useState<{ name: string; detail: string }[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [streamId, setStreamId] = useState("");
  const [selected, setSelected] = useState<StudioRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [output]);

  const composed = interim ? `${brief} ${interim}`.trim() : brief;
  const previewFile = useMemo(() => {
    const list = selected?.files ?? files;
    if (!list.length) return null;
    if (previewHint) return previewHint(list);
    return list.find((f) => f.endsWith(".html")) ?? list.find((f) => f.endsWith(".svg")) ?? null;
  }, [files, previewHint, selected]);

  const run = useCallback(async () => {
    const text = composed.trim();
    if (!text || busy) return;

    setBusy(true);
    setOutput("");
    setTools([]);
    setFiles([]);
    setErrors([]);
    setSelected(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let full = "";
    let produced: string[] = [];

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
          produced = evt.files ?? [];
          setFiles(produced);
          break;
        case "err":
          setErrors((e) => [...e, evt.text ?? ""].slice(-20));
          break;
        default:
          break;
      }
    };

    try {
      await streamNdjson(
        "/api/run",
        { agent, prompt: buildPrompt(text, values), project },
        onEvent,
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) setErrors((prev) => [...prev, e instanceof Error ? e.message : String(e)]);
    }

    const entry: StudioRun = {
      id: `r_${Date.now()}`,
      brief: text,
      options: { ...values },
      at: Date.now(),
      project,
      files: produced,
      text: full.slice(0, 60_000),
      agent,
    };
    setDoc({ runs: [entry, ...(doc.runs ?? [])].slice(0, 60) });
    setBrief("");
    setInterim("");
    setBusy(false);
    abortRef.current = null;
  }, [agent, brief, buildPrompt, busy, composed, doc.runs, project, setDoc, values]);

  const stop = useCallback(async () => {
    if (streamId) {
      await fetch(`/api/agents/${agent}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId }),
      }).catch(() => {});
    }
    abortRef.current?.abort();
    setBusy(false);
  }, [agent, streamId]);

  const shown = selected ?? (output || files.length ? null : doc.runs?.[0] ?? null);
  const shownText = selected ? selected.text : output || shown?.text || "";
  const shownFiles = selected ? selected.files : files.length ? files : (shown?.files ?? []);

  return (
    <PageShell>
      <PageHeader
        eyebrow={eyebrow}
        icon={icon}
        accent={accent}
        title={title}
        subtitle={subtitle}
        actions={
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="input !w-auto py-1.5 text-[12.5px]"
            aria-label="Agent"
          >
            {AGENTS.filter((a) => CAPABLE_AGENTS.includes(a.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        }
      />

      {secondary && (
        <Tabs tabs={[primaryLabel, secondary.label]} active={pane} onChange={setPane} />
      )}

      {secondary && pane === secondary.label ? (
        secondary.node
      ) : (
      <>
      {status && !status.ready && (
        <div className="mb-5">
          <SetupNeeded
            title={`${title} needs one thing first`}
            requirements={status.requirements}
            note="Everything else on this page keeps working — briefs you write are saved locally either way."
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel>
            <label htmlFor="studio-brief" className="eyebrow mb-2 block">
              Brief
            </label>
            <textarea
              id="studio-brief"
              rows={4}
              value={composed}
              onChange={(e) => {
                setInterim("");
                setBrief(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
              }}
              placeholder={placeholder}
              className="textarea !border-0 !bg-transparent !px-1 focus:!shadow-none"
            />

            {options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--line)] pt-3">
                {options.map((o) => (
                  <div key={o.key}>
                    <label htmlFor={`opt-${o.key}`} className="eyebrow mb-1 block">
                      {o.label}
                    </label>
                    {o.choices ? (
                      <select
                        id={`opt-${o.key}`}
                        value={values[o.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [o.key]: e.target.value }))}
                        className="input !w-auto py-1.5 text-[12.5px]"
                      >
                        {o.choices.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`opt-${o.key}`}
                        value={values[o.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [o.key]: e.target.value }))}
                        placeholder={o.placeholder}
                        className="input !w-[190px] py-1.5 text-[12.5px]"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
              <div className="flex items-center gap-2">
                <VoiceButton
                  size={38}
                  title="Speak the brief"
                  onTranscript={(t, o) => {
                    if (o.final) {
                      setInterim("");
                      setBrief((prev) => (prev ? `${prev} ${t}` : t));
                    } else {
                      setInterim(t);
                    }
                  }}
                />
                {examples.slice(0, 2).map((ex) => (
                  <button key={ex} onClick={() => setBrief(ex)} className="btn btn-ghost text-[12px]">
                    {ex.length > 42 ? `${ex.slice(0, 40)}…` : ex}
                  </button>
                ))}
              </div>
              {busy ? (
                <button onClick={() => void stop()} className="btn text-rose-200">
                  <Square size={13} /> Stop
                </button>
              ) : (
                <button onClick={() => void run()} disabled={!composed.trim()} className="btn btn-primary">
                  <Play size={14} /> Run
                </button>
              )}
            </div>
            {note && <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">{note}</p>}
          </Panel>

          {(busy || Boolean(shownText) || errors.length > 0) && (
            <Panel
              title="Output"
              subtitle={busy ? "streaming…" : shown ? `saved · ${relTime(shown.at)}` : undefined}
              actions={busy ? <Spinner /> : undefined}
            >
              {!!tools.length && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {tools.slice(-8).map((t, i) => (
                    <span key={`${t.name}-${i}`} className="pill" title={t.detail}>
                      <Wrench size={10} />
                      {t.name}
                      {t.detail && <span className="max-w-[220px] truncate text-[var(--fg-mute)]">{t.detail}</span>}
                    </span>
                  ))}
                </div>
              )}
              <pre
                ref={outRef}
                className="scroll mono max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--fg-soft)]"
              >
                {shownText || (busy ? "working…" : "")}
              </pre>
              {!!errors.length && (
                <pre className="mono mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5 text-[11px] text-rose-200">
                  {errors.join("\n").slice(-1500)}
                </pre>
              )}
            </Panel>
          )}

          {shownFiles.length > 0 && (
            <Panel title="Files" subtitle={`workspace · ${project}`} padded={false}>
              <ul className="divide-y divide-[var(--line)]">
                {shownFiles.slice(0, 30).map((f) => (
                  <li key={f} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="mono min-w-0 flex-1 truncate text-[var(--fg-soft)]">{f}</span>
                    <a
                      href={`/api/preview/${project}/${f}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {previewFile && (
            <Panel title="Preview" subtitle={previewFile} padded={false}>
              <iframe
                key={previewFile}
                src={`/api/preview/${project}/${previewFile}`}
                title="Build preview"
                sandbox="allow-scripts allow-forms allow-modals"
                className="h-[520px] w-full rounded-b-[13px] border-0 bg-white"
              />
            </Panel>
          )}
        </div>

        <aside>
          <Panel title="History" subtitle={`${doc.runs?.length ?? 0} saved`} padded={false}>
            {doc.runs?.length ? (
              <ul className="scroll max-h-[560px] divide-y divide-[var(--line)] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {doc.runs.map((r) => (
                    <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group">
                      <button
                        onClick={() => setSelected(r)}
                        className="w-full px-5 py-3 text-left transition hover:bg-[rgba(244,239,230,0.04)]"
                        style={{ background: selected?.id === r.id ? "rgba(244,239,230,0.05)" : undefined }}
                      >
                        <span className="block truncate text-[12.5px] text-[var(--fg-soft)]">{r.brief}</span>
                        <span className="mt-0.5 block text-[10.5px] text-[var(--fg-mute)]">
                          {r.agent} · {r.files.length} file{r.files.length === 1 ? "" : "s"} · {relTime(r.at)}
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <EmptyState icon="History" title="No runs yet" body="Your briefs and their output are saved here." />
            )}
            {!!doc.runs?.length && (
              <div className="border-t border-[var(--line)] px-5 py-3">
                <button
                  onClick={() => {
                    setDoc({ runs: [] });
                    setSelected(null);
                  }}
                  className="btn btn-ghost !px-2 text-[12px]"
                >
                  <Trash2 size={13} /> Clear history
                </button>
              </div>
            )}
          </Panel>
        </aside>
      </div>
      </>
      )}
    </PageShell>
  );
}
