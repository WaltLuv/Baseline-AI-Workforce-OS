"use client";

/**
 * The Agency — 230+ specialist agent personalities from
 * WaltLuv/agency-agents-v2, browsed live from your local clone. Installed
 * state is read from ~/.claude/agents (never written by this app); dispatch
 * goes through Claude Code's native subagent mechanism.
 */

import { useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import { EmptyState, Icon, PageHeader, PageShell, Panel, SetupNeeded, Spinner, Stat, StatusPill, alpha } from "@/components/ui";

const ACCENT = "#c084fc";

interface AgencyAgent {
  slug: string;
  division: string;
  name: string;
  description: string;
  emoji: string;
  vibe: string;
  installed: boolean;
}
interface Division {
  slug: string;
  label: string;
  icon: string;
  color: string;
  count: number;
  installedCount: number;
}
interface Overview {
  repoPath: string | null;
  repoFound: boolean;
  cloneCommand: string;
  installDir: string;
  installedCount: number;
  totalCount: number;
  installCommand: string;
  divisions: Division[];
}

export default function AgencyPage() {
  const { data, refresh } = useJson<Overview>("/api/agency");
  const [division, setDivision] = useState<Division | null>(null);
  const { data: divisionData } = useJson<{ agents: AgencyAgent[] }>(
    division ? `/api/agency?division=${division.slug}` : null,
  );
  const [preview, setPreview] = useState<AgencyAgent | null>(null);
  const { data: previewData } = useJson<{ body: string }>(
    preview ? `/api/agency?division=${preview.division}&agent=${encodeURIComponent(preview.slug)}` : null,
  );
  const [dispatchTo, setDispatchTo] = useState<AgencyAgent | null>(null);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration · The Agency"
        title="Agency Agents"
        subtitle="A complete AI agency: specialist personalities across every division, read live from your local clone. Installed state comes from ~/.claude/agents — this app shows install commands, it never writes there."
        accent={ACCENT}
        icon="Drama"
        actions={<button className="btn" onClick={() => void refresh()}>Refresh</button>}
      />

      {data && !data.repoFound && (
        <div className="mb-5">
          <SetupNeeded
            title="The Agency repo is not cloned yet"
            requirements={[
              {
                label: "agency-agents-v2 clone",
                met: false,
                detail: "no clone found at ~/code/agency-agents-v2 (or WORKFORCE_AGENCY_REPO)",
                install: data.cloneCommand,
              },
            ]}
            note="One clone powers everything here — the roster is read from the repo's real files, never a hardcoded list."
          />
        </div>
      )}

      {data?.repoFound && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Specialists" value={data.totalCount} hint={`across ${data.divisions.length} divisions`} icon="Drama" accent={ACCENT} />
            <Stat
              label="Installed for Claude Code"
              value={`${data.installedCount}/${data.totalCount}`}
              hint={data.installDir}
              icon="CircleCheck"
              accent="var(--emerald)"
            />
            <Stat label="Roster source" value="Local clone" hint={data.repoPath ?? ""} icon="FolderGit2" accent="var(--cyan)" />
          </div>

          {data.installedCount === 0 && (
            <Panel className="mb-5">
              <p className="mb-2 text-[12.5px] text-[var(--fg-dim)]">
                Nothing installed yet — run the repo&apos;s installer (it writes into ~/.claude/agents; this app only reads):
              </p>
              <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[11.5px] text-[var(--fg-soft)]">
                {data.installCommand}
                {"\n"}# or one division: ./scripts/install.sh --tool claude-code --division engineering
              </pre>
            </Panel>
          )}

          {!division ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.divisions.map((d) => (
                <button key={d.slug} className="panel panel-hover p-4 text-left" onClick={() => setDivision(d)}>
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className="grid h-9 w-9 place-items-center rounded-lg border"
                      style={{ borderColor: alpha(d.color, 30), background: alpha(d.color, 10), color: d.color }}
                    >
                      <Icon name={d.icon} size={16} />
                    </span>
                    <span className="text-[11px] text-[var(--fg-mute)]">
                      {d.installedCount}/{d.count} installed
                    </span>
                  </div>
                  <div className="text-[14px] font-semibold capitalize">{d.label}</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--fg-mute)]">
                    {d.count} specialist{d.count === 1 ? "" : "s"}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <button className="btn !px-2.5 text-[12px]" onClick={() => setDivision(null)}>
                <Icon name="ArrowLeft" size={12} /> All divisions
              </button>
              <Panel title={division.label} subtitle={`${division.count} specialists · ${division.installedCount} installed`} padded={false}>
                <ul className="divide-y divide-[var(--line)]">
                  {(divisionData?.agents ?? []).map((a) => (
                    <li key={a.slug} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-7 shrink-0 text-center text-[16px]">{a.emoji || "🎭"}</span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => setPreview(a)}>
                        <span className="block text-[13px] font-medium text-[var(--fg-soft)]">{a.name}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-[var(--fg-mute)]">{a.description}</span>
                      </button>
                      <StatusPill ready={a.installed} label={a.installed ? "Installed" : "Not installed"} />
                      <button
                        className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                        onClick={() => setDispatchTo(a)}
                        title={a.installed ? "Dispatch a task through Claude Code" : "Works best once installed — the dispatch will say so honestly"}
                      >
                        <Icon name="Send" size={11} /> Dispatch
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="panel max-h-[84vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
              <span className="min-w-0 truncate text-[13.5px] font-medium">
                {preview.emoji} {preview.name}
                <span className="mono ml-2 text-[10.5px] text-[var(--fg-mute)]">{preview.division}/{preview.slug}.md</span>
              </span>
              <button onClick={() => setPreview(null)} className="btn btn-ghost !px-2" aria-label="Close">
                <Icon name="X" size={15} />
              </button>
            </div>
            <pre className="scroll max-h-[70vh] overflow-y-auto whitespace-pre-wrap p-5 text-[12px] leading-relaxed text-[var(--fg-soft)]">
              {previewData?.body ?? "loading…"}
            </pre>
          </div>
        </div>
      )}

      {dispatchTo && <DispatchModal agent={dispatchTo} onClose={() => setDispatchTo(null)} />}
    </PageShell>
  );
}

function DispatchModal({ agent, onClose }: { agent: AgencyAgent; onClose: () => void }) {
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    if (!task.trim() || running) return;
    setRunning(true);
    setOutput("");
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    const prompt = agent.installed
      ? `Use the "${agent.name}" subagent (installed in ~/.claude/agents as ${agent.slug}.md) for this task, staying fully in its personality and workflow:\n\n${task.trim()}`
      : `The operator wants the "${agent.name}" Agency specialist for this task, but it is NOT installed in ~/.claude/agents yet. Do the task yourself in that specialist's spirit, and finish by noting the exact install command (./scripts/install.sh --tool claude-code from the agency-agents-v2 repo) so next time the real personality handles it:\n\n${task.trim()}`;
    try {
      await streamNdjson(
        "/api/run",
        { agent: "claude", prompt, project: "agency-dispatch" },
        (evt: StreamEvent) => {
          if ((evt.t === "delta" || evt.t === "final" || evt.t === "text") && evt.text) {
            acc = evt.t === "delta" ? acc + evt.text : evt.text;
            setOutput(acc);
          } else if (evt.t === "err" && evt.text) {
            setOutput((o) => `${o}\n[error] ${evt.text}`);
          }
        },
        ac.signal,
      );
    } catch (e) {
      setOutput((o) => `${o}\n[error] ${e instanceof Error ? e.message : String(e)}`);
    }
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="panel max-h-[84vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <span className="text-[13.5px] font-medium">
            Dispatch to {agent.emoji} {agent.name}
          </span>
          <button onClick={onClose} className="btn btn-ghost !px-2" aria-label="Close">
            <Icon name="X" size={15} />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {!agent.installed && (
            <p className="text-[11.5px] leading-relaxed text-amber-100/80">
              Not installed yet — Claude Code will work in this specialist&apos;s spirit and tell you the install command.
            </p>
          )}
          <textarea className="textarea w-full" rows={4} placeholder={`A task for ${agent.name}…`} value={task} onChange={(e) => setTask(e.target.value)} />
          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => void run()} disabled={running || !task.trim()}>
              {running ? <Spinner size={13} /> : <Icon name="Send" size={13} />} Dispatch
            </button>
            {running && (
              <button className="btn" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          {output && (
            <pre className="scroll max-h-[38vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-3 text-[12px] leading-relaxed text-[var(--fg-soft)]">
              {output}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
