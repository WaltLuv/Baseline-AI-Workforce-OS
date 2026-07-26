"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useJson } from "@/lib/client";
import type { SessionSummary, UsageRollup } from "@/lib/claudeData";
import { EmptyState, PageHeader, PageShell, Panel, Sparkbars, Stat, Tabs, compact, relTime } from "@/components/ui";

interface ActivityResponse {
  sessions: SessionSummary[];
  usage: UsageRollup;
}

export default function ActivityPage() {
  const { data, loading, refresh } = useJson<ActivityResponse>("/api/activity?limit=60", { pollMs: 60_000 });
  const [tab, setTab] = useState("Sessions");

  const usage = data?.usage;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Command"
        icon="Activity"
        accent="#38bdf8"
        title="Activity"
        subtitle="Every Claude Code session on this machine, read straight from ~/.claude/projects. Read-only — nothing is modified."
        actions={
          <button onClick={() => void refresh()} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Rescan
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions read" value={usage?.totalSessions ?? "—"} icon="MessageSquare" accent="#38bdf8" />
        <Stat label="Messages" value={usage ? compact(usage.totalMessages) : "—"} icon="MessagesSquare" accent="var(--gold)" />
        <Stat label="Tool calls" value={usage ? compact(usage.totalToolCalls) : "—"} icon="Wrench" accent="var(--violet)" />
        <Stat
          label="Tokens"
          value={usage ? compact(usage.inputTokens + usage.outputTokens) : "—"}
          hint={usage ? `${compact(usage.inputTokens)} in · ${compact(usage.outputTokens)} out` : ""}
          icon="Coins"
          accent="var(--emerald)"
        />
      </div>

      <Tabs tabs={["Sessions", "Projects", "Usage"]} active={tab} onChange={setTab} />

      {tab === "Sessions" && (
        <Panel padded={false}>
          {data?.sessions.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {data.sessions.map((s) => (
                <li key={s.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-[var(--fg-soft)]">{s.firstPrompt || "(no prompt captured)"}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--fg-mute)]">
                        <span className="mono">{s.project}</span>
                        <span>·</span>
                        <span>{s.messages} messages</span>
                        <span>·</span>
                        <span>{s.toolCalls} tools</span>
                        <span>·</span>
                        <span>{compact(s.inputTokens + s.outputTokens)} tokens</span>
                        {s.models[0] && (
                          <>
                            <span>·</span>
                            <span className="mono">{s.models[0]}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(s.updatedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="Activity"
              title="No sessions found"
              body="Nothing under ~/.claude/projects yet. Run a Claude Code session and rescan."
            />
          )}
        </Panel>
      )}

      {tab === "Projects" && (
        <Panel padded={false}>
          {usage?.projects.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {usage.projects.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="mono min-w-0 flex-1 truncate text-[var(--fg-soft)]">{p.name}</span>
                  <span className="text-[11.5px] text-[var(--fg-mute)]">
                    {p.sessions} session{p.sessions === 1 ? "" : "s"} · {compact(p.tokens)} tokens
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Folder" title="No projects yet" />
          )}
        </Panel>
      )}

      {tab === "Usage" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Tokens by day" subtitle="Last 14 days with activity">
            {usage?.byDay.length ? (
              <>
                <Sparkbars data={usage.byDay.map((d) => ({ label: d.day, value: d.tokens }))} height={90} accent="var(--violet)" />
                <div className="mt-2 flex justify-between text-[10.5px] text-[var(--fg-mute)]">
                  <span>{usage.byDay[0]?.day}</span>
                  <span>{usage.byDay[usage.byDay.length - 1]?.day}</span>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-[var(--fg-mute)]">No data yet.</p>
            )}
          </Panel>

          <Panel title="Messages by day">
            {usage?.byDay.length ? (
              <Sparkbars data={usage.byDay.map((d) => ({ label: d.day, value: d.messages }))} height={90} accent="var(--gold)" />
            ) : (
              <p className="text-[12.5px] text-[var(--fg-mute)]">No data yet.</p>
            )}
          </Panel>

          <Panel title="Models seen" className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              {usage?.models.length ? (
                usage.models.map((m) => (
                  <span key={m} className="pill mono">
                    {m}
                  </span>
                ))
              ) : (
                <span className="text-[12.5px] text-[var(--fg-mute)]">None recorded.</span>
              )}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
              Token counts come from the usage each session recorded. Sessions are sampled from the head and tail of very
              large transcripts, so totals on long-running projects are a floor, not a billing figure.
            </p>
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
