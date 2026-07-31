"use client";

import { useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Spinner, Tabs, alpha } from "@/components/ui";

const ACCENT = "#f0abfc";
const TABS = ["Today", "History", "Run now", "Schedule"];

interface Prescription {
  id: string;
  cat: "MEMORY" | "COST" | "SKILLS" | "WORKFLOW";
  tone: string;
  headline: string;
  prescription: string;
  evidence: string[];
  command: string;
  dollarImpact: number | null;
  timeImpactMins: number | null;
}
interface Dream {
  date: string;
  model: string;
  generatedAt: string;
  prescriptions: Prescription[];
}
interface Payload {
  latest: Dream | null;
  history: string[];
}

const CAT_META: Record<string, { color: string; icon: string; label: string }> = {
  MEMORY: { color: "#f472b6", icon: "Brain", label: "Memory" },
  COST: { color: "#fb923c", icon: "Coins", label: "Cost" },
  SKILLS: { color: "#60a5fa", icon: "Zap", label: "Skills" },
  WORKFLOW: { color: "#facc15", icon: "Workflow", label: "Workflow" },
};

export default function DreamPage() {
  const [tab, setTab] = useState(TABS[0]);
  const { data, refresh } = useJson<Payload>("/api/dream");

  return (
    <PageShell>
      <PageHeader
        eyebrow="Command · Overnight audit"
        title="Dream Review"
        subtitle="Audits your last 24 hours of AI activity and prescribes the four highest-impact improvements — evidence-backed, never invented. Insufficient signal means fewer cards, not fabricated ones."
        accent={ACCENT}
        icon="MoonStar"
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "Today" && <TodayTab dream={data?.latest ?? null} />}
      {tab === "History" && <HistoryTab dates={data?.history ?? []} />}
      {tab === "Run now" && <RunTab onDone={refresh} />}
      {tab === "Schedule" && <ScheduleTab />}
    </PageShell>
  );
}

function DreamCards({ dream }: { dream: Dream }) {
  const totalDollar = dream.prescriptions.reduce((a, p) => a + (p.dollarImpact ?? 0), 0);
  const totalMins = dream.prescriptions.reduce((a, p) => a + (p.timeImpactMins ?? 0), 0);
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-[var(--fg-mute)]">
        {dream.date} · {dream.prescriptions.length} prescriptions · model {dream.model}
        {totalDollar > 0 ? ` · ~$${totalDollar}/mo impact` : ""}
        {totalMins > 0 ? ` · ~${totalMins} min/mo saved` : ""}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {dream.prescriptions.map((p) => {
          const meta = CAT_META[p.cat] ?? CAT_META.SKILLS;
          return (
            <Panel key={p.id} className="panel-hover">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg border"
                  style={{ borderColor: alpha(meta.color, 30), background: alpha(meta.color, 10), color: meta.color }}
                >
                  <Icon name={meta.icon} size={15} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {(p.dollarImpact || p.timeImpactMins) && (
                  <span className="ml-auto text-[11px] text-[var(--fg-mute)]">
                    {p.dollarImpact ? `$${p.dollarImpact}/mo` : ""}
                    {p.dollarImpact && p.timeImpactMins ? " · " : ""}
                    {p.timeImpactMins ? `${p.timeImpactMins} min/mo` : ""}
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-semibold leading-snug">{p.headline}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">{p.prescription}</p>
              {p.evidence.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.evidence.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-[var(--fg-mute)]">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: meta.color }} />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {p.command && (
                <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-2.5 text-[11px] text-[var(--fg-soft)]">
                  {p.command}
                </pre>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function TodayTab({ dream }: { dream: Dream | null }) {
  if (!dream) {
    return (
      <Panel>
        <EmptyState
          icon="MoonStar"
          title="No dream review yet"
          body="Run one now from the Run tab, or set up the 7am schedule. Prescriptions appear here as four cards."
        />
      </Panel>
    );
  }
  return <DreamCards dream={dream} />;
}

function HistoryTab({ dates }: { dates: string[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const { data } = useJson<Dream>(picked ? `/api/dream?date=${picked}` : null);
  if (!dates.length) {
    return (
      <Panel>
        <EmptyState icon="CalendarDays" title="No history" body="Each run writes one dated JSON file under ~/.baseline-workforce/dreams." />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {dates.map((d) => (
          <button key={d} className={`btn !px-2.5 text-[12px] ${picked === d ? "btn-primary" : ""}`} onClick={() => setPicked(d)}>
            {d}
          </button>
        ))}
      </div>
      {picked && data && <DreamCards dream={data} />}
    </div>
  );
}

function RunTab({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Dream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    setRunning(true);
    setLog([]);
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamNdjson(
        "/api/dream",
        { action: "run" },
        (evt: StreamEvent) => {
          if (evt.t === "meta") setLog((l) => [...l, `▸ ${evt.command}`]);
          else if (evt.t === "tool") setLog((l) => [...l, `⚙ ${evt.name}: ${evt.detail ?? ""}`]);
          else if (evt.t === "usage") setLog((l) => [...l, `tokens in ${evt.input ?? 0} / out ${evt.output ?? 0} · $${(evt.costUsd ?? 0).toFixed(4)}`]);
          else if (evt.t === "err" && evt.text) setLog((l) => [...l, `✗ ${evt.text}`]);
          else if (evt.t === "text" && evt.text) {
            try {
              setResult(JSON.parse(evt.text) as Dream);
            } catch {
              /* ignore */
            }
          } else if (evt.t === "end") setLog((l) => [...l, evt.ok ? "✓ dream written" : "✗ run failed"]);
        },
        ac.signal,
      );
    } catch (e) {
      setLog((l) => [...l, `✗ ${e instanceof Error ? e.message : String(e)}`]);
    }
    setRunning(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <Panel title="Run a dream review now" subtitle="Gathers real context (sessions, skills, goals, notes, A2A ledger), asks your anchor agent for the top 4, validates, writes the dated file.">
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={() => void run()} disabled={running}>
            {running ? <Spinner size={13} /> : <Icon name="MoonStar" size={13} />} {running ? "Dreaming…" : "Run /dream"}
          </button>
          {running && (
            <button className="btn" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          )}
        </div>
        {log.length > 0 && (
          <pre className="mono mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[11px] text-[var(--fg-dim)]">
            {log.join("\n")}
          </pre>
        )}
      </Panel>
      {result && <DreamCards dream={result} />}
    </div>
  );
}

function ScheduleTab() {
  const [artifacts, setArtifacts] = useState<{
    platform: string;
    files: { path: string; description: string }[];
    installCommand: string;
    note: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    const res = await fetch("/api/dream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "schedule" }),
    });
    setArtifacts(await res.json());
    setBusy(false);
  };

  return (
    <Panel
      title="Daily at 07:00"
      subtitle="This app generates the scheduler files and hands you the install command — it never installs anything into launchd or your crontab itself."
    >
      <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
        {busy ? <Spinner size={13} /> : <Icon name="AlarmClock" size={13} />} Generate schedule files
      </button>
      {artifacts && (
        <div className="mt-4 space-y-3">
          {artifacts.files.map((f) => (
            <p key={f.path} className="text-[12px] text-[var(--fg-dim)]">
              <span className="mono">{f.path}</span> — {f.description}
            </p>
          ))}
          <div>
            <span className="eyebrow mb-1 block">Run this yourself, once:</span>
            <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[11.5px] text-[var(--fg-soft)]">
              {artifacts.installCommand}
            </pre>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--fg-mute)]">{artifacts.note}</p>
        </div>
      )}
    </Panel>
  );
}
