"use client";

import { useMemo, useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import type { A2AStatus, A2ATaskRecord, A2ATelemetry } from "@/lib/a2a";
import {
  EmptyState,
  Icon,
  PageHeader,
  PageShell,
  Panel,
  SetupNeeded,
  Sparkbars,
  Spinner,
  Stat,
  StatusPill,
  Tabs,
  compact,
  relTime,
} from "@/components/ui";

const ACCENT = "#a78bfa";
const TABS = ["Tasks", "Send", "Agent card", "Telemetry", "SOP"];

const STATE_LABEL: Record<A2ATaskRecord["state"], { label: string; ready: boolean }> = {
  submitted: { label: "Submitted", ready: false },
  working: { label: "Working", ready: false },
  completed: { label: "Completed", ready: true },
  failed: { label: "Failed", ready: false },
  canceled: { label: "Canceled", ready: false },
};

interface TasksPayload {
  records: A2ATaskRecord[];
  telemetry: A2ATelemetry;
}

export default function A2APage() {
  const [tab, setTab] = useState(TABS[0]);
  const { data: status, refresh: refreshStatus } = useJson<A2AStatus>("/api/a2a/status", { pollMs: 15_000 });
  const { data: tasks, refresh: refreshTasks } = useJson<TasksPayload>("/api/a2a/tasks", { pollMs: 15_000 });
  const { data: docs } = useJson<{ sop: string | null; swarm: string | null }>("/api/a2a/sop");

  const requirement = useMemo(
    () => [
      {
        label: "A2A server",
        met: Boolean(status?.up),
        detail: status?.detail ?? "checking…",
        install: "cd apps/a2a-server && uv sync && uv run python -m a2a_server",
      },
    ],
    [status],
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration · Agent2Agent"
        title="A2A"
        subtitle="Other agents discover this machine's skills from the agent card and hand it tasks over JSON-RPC. Everything below reads the local server and its on-disk ledger — nothing invented."
        accent={ACCENT}
        icon="Network"
        actions={
          <span className="flex items-center gap-2">
            <StatusPill ready={Boolean(status?.up)} label={status?.up ? "Server up" : "Server down"} />
            <button className="btn" onClick={() => void Promise.all([refreshStatus(), refreshTasks()])}>
              Refresh
            </button>
          </span>
        }
      />

      {status && !status.up && (
        <div className="mb-5">
          <SetupNeeded
            title="The A2A server is not running"
            requirements={requirement}
            note={`The task ledger below still works — it reads ${"~/.baseline-workforce/a2a"} from disk. Live sends need the server at ${status.baseUrl}.`}
          />
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Tasks" && <TasksTab records={tasks?.records ?? []} />}
      {tab === "Send" && <SendTab up={Boolean(status?.up)} skills={status?.card?.skills.map((s) => s.id) ?? []} onDone={refreshTasks} />}
      {tab === "Agent card" && <CardTab status={status} />}
      {tab === "Telemetry" && <TelemetryTab telemetry={tasks?.telemetry ?? null} />}
      {tab === "SOP" && <SopTab sop={docs?.sop ?? null} swarm={docs?.swarm ?? null} />}
    </PageShell>
  );
}

function TasksTab({ records }: { records: A2ATaskRecord[] }) {
  if (!records.length) {
    return (
      <Panel>
        <EmptyState
          icon="Network"
          title="No A2A tasks recorded yet"
          body="Every task another agent hands this machine lands in the ledger at ~/.baseline-workforce/a2a/transactions — one JSON line each. Run one from the Send tab."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Task ledger" subtitle="Newest first · read from disk, works even with the server down" padded={false}>
      <ul className="divide-y divide-[var(--line)]">
        {records.map((r) => {
          const s = STATE_LABEL[r.state] ?? { label: r.state, ready: false };
          return (
            <li key={`${r.taskId}-${r.startedAt}`} className="flex items-center gap-3 px-5 py-3">
              <span className="mono w-24 shrink-0 text-[11px] text-[var(--fg-mute)]" title={r.taskId}>
                {r.taskId.slice(0, 8)}
              </span>
              <span className="pill mono !text-[10px]">{r.skill}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg-dim)]">
                {r.error ? r.error : `${r.promptChars} prompt chars`}
                {r.costUsd ? ` · $${r.costUsd.toFixed(4)}` : ""}
                {r.inputTokens || r.outputTokens ? ` · ${compact(r.inputTokens)} in / ${compact(r.outputTokens)} out` : ""}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(Date.parse(r.startedAt) || 0)}</span>
              <StatusPill ready={s.ready} label={s.label} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SendTab({ up, skills, onDone }: { up: boolean; skills: string[]; onDone: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [skill, setSkill] = useState("");
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<{ kind: string; text: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const send = async () => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setLines([]);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    const push = (kind: string, text: string) =>
      setLines((prev) => [...prev.slice(-400), { kind, text }]);
    try {
      await streamNdjson(
        "/api/a2a/send",
        { skill: skill || undefined, prompt },
        (evt: StreamEvent) => {
          if (evt.t === "meta") push("meta", evt.command ?? "");
          else if (evt.t === "delta" && evt.text) {
            acc += evt.text;
            setLines((prev) => {
              const rest = prev.filter((l) => l.kind !== "reply");
              return [...rest, { kind: "reply", text: acc }];
            });
          } else if (evt.t === "final" && evt.text) {
            acc = evt.text;
            setLines((prev) => [...prev.filter((l) => l.kind !== "reply"), { kind: "reply", text: acc }]);
          } else if (evt.t === "tool") push("tool", `${evt.name ?? "tool"} ${evt.detail ?? ""}`.trim());
          else if (evt.t === "err" && evt.text) push("err", evt.text);
          else if (evt.t === "end") push("meta", evt.ok ? "task finished" : "task failed");
        },
        ac.signal,
      );
    } catch (e) {
      push("err", e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
      onDone();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Send a task" subtitle="Goes through the real protocol — message/stream on the local server" className="lg:col-span-1">
        <div className="space-y-3">
          <div>
            <label className="eyebrow mb-1.5 block">Skill</label>
            <select className="input w-full" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">server default</option>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="eyebrow mb-1.5 block">Message</label>
            <textarea
              className="textarea w-full"
              rows={5}
              placeholder="e.g. Reply with exactly: A2A_READY"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => void send()} disabled={!up || running || !prompt.trim()}>
              {running ? <Spinner size={13} /> : <Icon name="Send" size={13} />} Send task
            </button>
            {running && (
              <button className="btn" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          {!up && <p className="text-[12px] text-[var(--fg-mute)]">Start the A2A server first — see the panel above.</p>}
        </div>
      </Panel>
      <Panel title="Stream" subtitle="Task status events as they arrive" className="lg:col-span-2">
        {lines.length === 0 ? (
          <p className="text-[12.5px] text-[var(--fg-mute)]">Nothing sent yet.</p>
        ) : (
          <div className="scroll max-h-[430px] space-y-2 overflow-y-auto">
            {lines.map((l, i) => (
              <div key={i} className="text-[12.5px] leading-relaxed">
                {l.kind === "reply" && (
                  <div className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-3 text-[var(--fg-soft)]">
                    {l.text}
                  </div>
                )}
                {l.kind === "tool" && (
                  <div className="mono text-[11px] text-[var(--fg-dim)]">
                    <Icon name="Wrench" size={11} className="mr-1 inline" />
                    {l.text}
                  </div>
                )}
                {l.kind === "err" && <div className="text-[12px] text-[var(--rose,#fb7185)]">{l.text}</div>}
                {l.kind === "meta" && <div className="mono text-[10.5px] text-[var(--fg-mute)]">{l.text}</div>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CardTab({ status }: { status: A2AStatus | null }) {
  const { data: raw } = useJson<Record<string, unknown>>(status?.up ? "/api/a2a/card" : null);
  if (!status?.up) {
    return (
      <Panel>
        <EmptyState icon="IdCard" title="No card to show" body="The agent card comes from the live server at /.well-known/agent-card.json. Start the server to see it." />
      </Panel>
    );
  }
  const card = status.card;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={card?.name ?? "Agent card"} subtitle={`v${card?.version ?? "?"} · ${status.baseUrl}`}>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--fg-dim)]">{card?.description}</p>
        <div className="space-y-3">
          {card?.skills.map((s) => (
            <div key={s.id} className="rounded-xl border border-[var(--line)] p-3.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[13px] font-medium">{s.name}</span>
                <span className="pill mono !text-[10px]">{s.id}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--fg-mute)]">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.tags.map((t) => (
                  <span key={t} className="pill !text-[10px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {card && card.skills.length === 0 && (
            <p className="text-[12.5px] text-[var(--fg-mute)]">
              The card lists no skills right now — none of the bridged CLIs are installed. That is the card being honest.
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Raw JSON" subtitle="/.well-known/agent-card.json, verbatim">
        <pre className="mono scroll max-h-[480px] overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--fg-dim)]">
          {raw ? JSON.stringify(raw, null, 2) : "…"}
        </pre>
      </Panel>
    </div>
  );
}

function TelemetryTab({ telemetry }: { telemetry: A2ATelemetry | null }) {
  if (!telemetry || telemetry.totalTasks === 0) {
    return (
      <Panel>
        <EmptyState icon="ChartColumn" title="No telemetry yet" body="Task counts, tokens and spend appear here once the ledger has entries." />
      </Panel>
    );
  }
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tasks" value={telemetry.totalTasks} hint={`${telemetry.completed} completed · ${telemetry.failed} failed`} icon="ListChecks" accent={ACCENT} />
        <Stat label="Tokens in" value={compact(telemetry.inputTokens)} icon="ArrowDownToLine" accent="var(--cyan)" />
        <Stat label="Tokens out" value={compact(telemetry.outputTokens)} icon="ArrowUpFromLine" accent="var(--emerald)" />
        <Stat label="Spend" value={`$${telemetry.costUsd.toFixed(4)}`} hint="Sum of per-task CLI-reported cost" icon="Coins" accent="var(--gold)" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tasks per day" subtitle="Last 14 days with activity">
          <Sparkbars data={telemetry.byDay.map((d) => ({ label: d.day, value: d.tasks }))} accent={ACCENT} height={56} />
          <div className="mt-2 flex justify-between text-[10.5px] text-[var(--fg-mute)]">
            <span>{telemetry.byDay[0]?.day}</span>
            <span>{telemetry.byDay[telemetry.byDay.length - 1]?.day}</span>
          </div>
        </Panel>
        <Panel title="By skill" padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {telemetry.bySkill.map((s) => (
              <li key={s.skill} className="flex items-center justify-between px-5 py-2.5 text-[12.5px]">
                <span className="mono">{s.skill}</span>
                <span className="text-[var(--fg-dim)]">
                  {s.tasks} task{s.tasks === 1 ? "" : "s"} · ${s.costUsd.toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function SopTab({ sop, swarm }: { sop: string | null; swarm: string | null }) {
  const [doc, setDoc] = useState<"sop" | "swarm">("sop");
  const text = doc === "sop" ? sop : swarm;
  return (
    <Panel
      title={doc === "sop" ? "Hand-off SOP" : "Swarm orchestration blueprint"}
      subtitle="Read straight from apps/a2a-server/docs — the same files a human operator gets"
      actions={
        <span className="inline-flex gap-1">
          <button className={`btn !px-2.5 text-[12px] ${doc === "sop" ? "btn-primary" : ""}`} onClick={() => setDoc("sop")}>
            SOP
          </button>
          <button className={`btn !px-2.5 text-[12px] ${doc === "swarm" ? "btn-primary" : ""}`} onClick={() => setDoc("swarm")}>
            Swarm
          </button>
        </span>
      }
    >
      {text ? (
        <pre className="scroll max-h-[560px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--fg-soft)]">{text}</pre>
      ) : (
        <p className="text-[12.5px] text-[var(--fg-mute)]">
          Doc not found — expected in apps/a2a-server/docs next to this app.
        </p>
      )}
    </Panel>
  );
}
