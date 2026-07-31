"use client";

/**
 * Oh My Pi's extra surfaces on the agent page: what the harness keeps under
 * ~/.omp (Skills, Harness) and whether it can actually run (Status). All of it
 * is read live from disk by /api/omp — nothing invented, nothing written.
 */

import { useRef, useState } from "react";
import { streamNdjson, useJson, type StreamEvent } from "@/lib/client";
import { EmptyState, Icon, Panel, Spinner, StatusPill, relTime } from "@/components/ui";

interface OmpDirInfo {
  label: string;
  relPath: string;
  exists: boolean;
  fileCount: number;
  note?: string;
}
interface OmpOverview {
  installed: boolean;
  bin: string | null;
  configRoot: string;
  configRootExists: boolean;
  providerKeys: { key: string; present: boolean }[];
  needsSetup: boolean;
  dirs: OmpDirInfo[];
  skills: { name: string; description: string; updatedAt: number }[];
  agentsMd: string | null;
  systemMd: string | null;
  modelsYml: string | null;
  install: string;
}

export default function OmpPanels({ view }: { view: "Skills" | "Harness" | "Status" }) {
  const { data, refresh } = useJson<OmpOverview>("/api/omp", { pollMs: 30_000 });

  if (!data) {
    return (
      <Panel>
        <p className="text-[12.5px] text-[var(--fg-mute)]">Reading ~/.omp…</p>
      </Panel>
    );
  }
  if (view === "Skills") return <SkillsView data={data} />;
  if (view === "Harness") return <HarnessView data={data} />;
  return <StatusView data={data} onRefresh={refresh} />;
}

function Disambiguation() {
  return (
    <p className="rounded-xl border border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.06)] p-3.5 text-[12.5px] leading-relaxed text-amber-100">
      <strong>Oh My Pi ≠ PI Agent.</strong> Oh My Pi is the <code className="mono">omp</code> coding-harness CLI on
      this machine. The “PI Agent” is a separate memory persona elsewhere in the Baseline ecosystem. They are not the
      same thing and are never merged.
    </p>
  );
}

function SkillsView({ data }: { data: OmpOverview }) {
  return (
    <div className="space-y-4">
      <Panel
        title="Harness skills"
        subtitle={`Read from ${data.configRoot}/skills — the skills omp itself loads`}
        padded={false}
      >
        {data.skills.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {data.skills.map((s) => (
              <li key={s.name} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 text-[var(--violet)]">
                  <Icon name="Zap" size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[var(--fg-soft)]">{s.name}</span>
                  {s.description && (
                    <span className="mt-0.5 block text-[12px] text-[var(--fg-mute)]">{s.description}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(s.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="Zap"
            title="No harness skills found"
            body={
              data.configRootExists
                ? `${data.configRoot}/skills is empty. This list is real — nothing is faked here.`
                : `${data.configRoot} does not exist yet. It appears after the first omp run.`
            }
          />
        )}
      </Panel>
    </div>
  );
}

function HarnessView({ data }: { data: OmpOverview }) {
  const files: { label: string; text: string | null }[] = [
    { label: "agent/AGENTS.md", text: data.agentsMd },
    { label: "agent/SYSTEM.md", text: data.systemMd },
    { label: "agent/models.yml", text: data.modelsYml },
  ];
  return (
    <div className="space-y-4">
      <Panel title="Where omp keeps state" subtitle={data.configRoot} padded={false}>
        <ul className="divide-y divide-[var(--line)]">
          {data.dirs.map((d) => (
            <li key={d.relPath} className="flex items-center gap-3 px-5 py-2.5">
              <span className="mono w-40 shrink-0 text-[12px] text-[var(--fg-soft)]">{d.relPath}</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--fg-mute)]">
                {d.label}
                {d.note ? ` · ${d.note}` : ""}
              </span>
              <StatusPill
                ready={d.exists}
                label={d.exists ? (d.fileCount ? `${d.fileCount} files` : "present") : "absent"}
              />
            </li>
          ))}
        </ul>
      </Panel>
      {files.map(
        (f) =>
          f.text && (
            <Panel key={f.label} title={f.label} subtitle="Read-only view of the file omp loads">
              <pre className="mono scroll max-h-72 overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
                {f.text}
              </pre>
            </Panel>
          ),
      )}
    </div>
  );
}

function StatusView({ data, onRefresh }: { data: OmpOverview; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    let err = "";
    try {
      await streamNdjson(
        "/api/agents/ohmypi/chat",
        { prompt: "Reply with exactly: OMP_OK", history: [] },
        (evt: StreamEvent) => {
          if (evt.t === "delta" && evt.text) acc += evt.text;
          if (evt.t === "final" && evt.text) acc = evt.text;
          if (evt.t === "err" && evt.text) err += evt.text;
        },
        ac.signal,
      );
    } catch (e) {
      err += e instanceof Error ? e.message : String(e);
    }
    setTesting(false);
    setTestResult(acc.trim() || err.trim() || "(no output)");
  };

  return (
    <div className="space-y-4">
      <Disambiguation />
      <Panel title="Runtime status" subtitle="Honest state — never a fake online">
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1">Binary</dt>
            <dd className="mono break-all text-[var(--fg-dim)]">
              {data.bin ?? "`omp` was not found on this machine"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">State</dt>
            <dd>
              <StatusPill
                ready={!data.needsSetup}
                label={!data.installed ? "Setup needed" : data.needsSetup ? "Installed · no provider key" : "Ready"}
              />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="eyebrow mb-1">Config root</dt>
            <dd className="mono text-[var(--fg-dim)]">
              {data.configRoot} {data.configRootExists ? "" : " (does not exist yet)"}
            </dd>
          </div>
        </dl>
        {!data.installed && (
          <pre className="mono mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3.5 text-[var(--fg-soft)]">
            {data.install}
          </pre>
        )}
      </Panel>

      <Panel
        title="Provider keys"
        subtitle="omp needs at least one of these in the environment to run a model"
        padded={false}
      >
        <ul className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
          {data.providerKeys.map((k) => (
            <li key={k.key} className="flex items-center justify-between bg-[var(--bg-card)] px-4 py-2.5">
              <span className="mono text-[12px] text-[var(--fg-soft)]">{k.key}</span>
              <StatusPill ready={k.present} label={k.present ? "set" : "not set"} />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Test connection" subtitle="Runs the real binary: omp -p … 'Reply with exactly: OMP_OK'">
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={() => void runTest()} disabled={testing || !data.installed}>
            {testing ? <Spinner size={13} /> : <Icon name="PlugZap" size={13} />} Run test
          </button>
          <button className="btn" onClick={onRefresh}>
            Re-scan ~/.omp
          </button>
        </div>
        {testResult !== null && (
          <div className="mt-3">
            <span className="eyebrow mb-1 block">Result (verbatim)</span>
            <pre className="mono whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[12px] text-[var(--fg-soft)]">
              {testResult}
            </pre>
            <p className="mt-1.5 text-[11.5px] text-[var(--fg-mute)]">
              {testResult.includes("OMP_OK") ? "Contains OMP_OK — the harness answered." : "Did not contain OMP_OK."}
            </p>
          </div>
        )}
        {!data.installed && (
          <p className="mt-3 text-[12px] text-[var(--fg-mute)]">Install omp first — the test needs the real binary.</p>
        )}
      </Panel>
    </div>
  );
}
