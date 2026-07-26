"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { AGENTS, type AgentStatus } from "@/lib/agents";
import { FEATURES } from "@/lib/features";
import { useJson } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import { Icon, PageShell, Panel, Sparkbars, Stat, compact, relTime } from "@/components/ui";

interface Vitals {
  host: {
    user: string;
    platform: string;
    cpus: number;
    loadAvg: number;
    memTotal: number;
    memFree: number;
    uptime: number;
    location: string;
  };
  paths: { home: string; workspace: string; vault: string | null; vaultExists: boolean };
  agents: { connected: number; total: number; statuses: AgentStatus[] };
  work: {
    sessionsToday: number;
    recent: { id: string; project: string; firstPrompt: string; updatedAt: number; messages: number; toolCalls: number }[];
    usage: {
      totalSessions: number;
      totalMessages: number;
      totalToolCalls: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      byDay: { day: string; tokens: number; messages: number }[];
      projects: { name: string; sessions: number; tokens: number }[];
      models: string[];
    };
    projects: { name: string; files: number; updatedAt: number }[];
  };
  goals: { open: number; done: number; next: { id: string; text: string; category?: string }[] };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function MissionControl() {
  const { data, loading, refresh } = useJson<Vitals>("/api/vitals", { pollMs: 30_000 });

  const statusById: Record<string, AgentStatus> = {};
  for (const s of data?.agents.statuses ?? []) statusById[s.id] = s;

  const usage = data?.work.usage;
  const quickPages = FEATURES.filter((f) =>
    ["goals", "journal", "room", "apps", "activity", "memory"].includes(f.id),
  );

  return (
    <PageShell>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Mission Control · {data?.host.location ?? "Local"}</div>
          <h1 className="text-[28px] leading-tight">
            {greeting()}, {data?.host.user ?? "there"}.
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-[var(--fg-dim)]">
            {data
              ? `${data.agents.connected} of ${data.agents.total} agents connected · ${data.work.sessionsToday} session${data.work.sessionsToday === 1 ? "" : "s"} in the last 24 hours · ${data.goals.open} goal${data.goals.open === 1 ? "" : "s"} open.`
              : "Reading what is on this machine…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refresh()} className="btn" title="Re-scan">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <Link href="/setup" className="btn btn-primary">
            Setup
          </Link>
        </div>
      </header>

      {/* KPI strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Agents connected"
          value={data ? `${data.agents.connected}/${data.agents.total}` : "—"}
          hint="Detected on this machine right now"
          icon="Users"
          accent="var(--gold)"
        />
        <Stat
          label="Tokens (recent sessions)"
          value={usage ? compact(usage.inputTokens + usage.outputTokens) : "—"}
          hint={usage ? `${compact(usage.inputTokens)} in · ${compact(usage.outputTokens)} out` : ""}
          icon="Coins"
          accent="var(--violet)"
        />
        <Stat
          label="Tool calls"
          value={usage ? compact(usage.totalToolCalls) : "—"}
          hint={usage ? `${usage.totalSessions} sessions read` : ""}
          icon="Wrench"
          accent="var(--cyan)"
        />
        <Stat
          label="Goals open"
          value={data ? data.goals.open : "—"}
          hint={data ? `${data.goals.done} done` : ""}
          icon="Target"
          accent="var(--emerald)"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Workforce roster */}
        <div className="lg:col-span-2">
          <Panel
            title="The workforce"
            subtitle="One page each — click through to chat"
            actions={
              <Link href="/setup" className="btn btn-ghost !px-2 text-[12px]">
                Connect more <ArrowUpRight size={12} />
              </Link>
            }
            padded={false}
          >
            <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
              {AGENTS.map((a, i) => {
                const status = statusById[a.id];
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                    className="bg-[var(--bg-card)]"
                  >
                    <Link href={`/agents/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-[rgba(244,239,230,0.04)]">
                      <AgentAvatar agent={a.id} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium">{a.name}</span>
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              background: status?.connected ? "#4ade80" : "rgba(244,239,230,0.2)",
                              boxShadow: status?.connected ? "0 0 7px #4ade80" : "none",
                            }}
                          />
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-[var(--fg-mute)]">
                          {status?.connected ? a.tagline : (status?.detail ?? "checking…")}
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Panel title="Token flow" subtitle="Last 14 days of Claude Code sessions">
            {usage?.byDay.length ? (
              <>
                <Sparkbars data={usage.byDay.map((d) => ({ label: d.day, value: d.tokens }))} height={56} />
                <div className="mt-2 flex justify-between text-[10.5px] text-[var(--fg-mute)]">
                  <span>{usage.byDay[0]?.day}</span>
                  <span>{usage.byDay[usage.byDay.length - 1]?.day}</span>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-[var(--fg-mute)]">No sessions found yet.</p>
            )}
            {!!usage?.models.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {usage.models.slice(0, 4).map((m) => (
                  <span key={m} className="pill mono !text-[10px]">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Next up" subtitle="From your goals" padded={false}>
            {data?.goals.next.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {data.goals.next.map((g) => (
                  <li key={g.id} className="flex items-start gap-2.5 px-5 py-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--emerald)]" />
                    <span className="text-[13px] leading-snug text-[var(--fg-soft)]">{g.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-5 text-[12.5px] text-[var(--fg-mute)]">
                No open goals.{" "}
                <Link href="/goals" className="underline decoration-dotted">
                  Add one
                </Link>
                .
              </p>
            )}
          </Panel>

          <Panel title="This machine">
            <dl className="space-y-2 text-[12px]">
              {[
                ["Host", data ? `${data.host.platform} · ${data.host.cpus} cores` : "—"],
                ["Load", data ? String(data.host.loadAvg) : "—"],
                [
                  "Memory",
                  data ? `${compact((data.host.memTotal - data.host.memFree) / 1e6)} / ${compact(data.host.memTotal / 1e6)} MB` : "—",
                ],
                ["Vault", data?.paths.vault ?? "not set"],
                ["Workspace", data?.paths.workspace ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-[var(--fg-mute)]">{k}</dt>
                  <dd className="mono min-w-0 truncate text-right text-[var(--fg-dim)]" title={String(v)}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      {/* Recent work + quick links */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Recent work"
            subtitle="Claude Code sessions on this machine"
            actions={
              <Link href="/activity" className="btn btn-ghost !px-2 text-[12px]">
                All activity <ArrowUpRight size={12} />
              </Link>
            }
            padded={false}
          >
            {data?.work.recent.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {data.work.recent.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--fg-mute)]">
                      <Icon name="MessageSquare" size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-[var(--fg-soft)]">
                        {s.firstPrompt || "(no prompt captured)"}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--fg-mute)]">
                        {s.project} · {s.messages} messages · {s.toolCalls} tool calls · {relTime(s.updatedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-[12.5px] text-[var(--fg-mute)]">
                Nothing read yet from ~/.claude/projects. Run a Claude Code session and it shows up here.
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Jump in" padded={false}>
          <div className="grid grid-cols-2 gap-px bg-[var(--line)]">
            {quickPages.map((f) => (
              <Link
                key={f.id}
                href={f.route}
                className="flex flex-col gap-1.5 bg-[var(--bg-card)] px-4 py-4 transition hover:bg-[rgba(244,239,230,0.04)]"
              >
                <span style={{ color: f.accent }}>
                  <Icon name={f.icon} size={17} />
                </span>
                <span className="text-[13px] font-medium">{f.title}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <p className="mt-8 text-center text-[11px] text-[var(--fg-mute)]">
        Everything here reads from this machine. Nothing is uploaded.{" "}
        <Link href="/settings" className="underline decoration-dotted">
          Settings
        </Link>
      </p>
    </PageShell>
  );
}
