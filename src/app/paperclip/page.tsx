"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { AGENTS, type AgentStatus } from "@/lib/agents";
import { useBoard, useJson } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import VoiceButton from "@/components/VoiceButton";
import { EmptyState, PageHeader, PageShell, Panel, Stat, Tabs, compact, relTime } from "@/components/ui";

interface Vitals {
  agents: { connected: number; total: number; statuses: AgentStatus[] };
  work: {
    sessionsToday: number;
    usage: { totalMessages: number; totalToolCalls: number; inputTokens: number; outputTokens: number; costUsd: number };
    projects: { name: string; files: number; updatedAt: number }[];
    recent: { id: string; project: string; firstPrompt: string; updatedAt: number }[];
  };
  goals: { open: number; done: number };
}

interface Order {
  id: string;
  text: string;
  department: string;
  at: number;
}

const DEPARTMENTS: { name: string; blurb: string; agents: string[]; route: string }[] = [
  { name: "Engineering", blurb: "Builds and maintains what ships.", agents: ["claude", "codex", "opencode", "kimi"], route: "/agent-kanban" },
  { name: "Design", blurb: "Everything anyone actually looks at.", agents: ["claude", "glmcode"], route: "/opendesign" },
  { name: "Growth", blurb: "Search, outreach and the standing scan.", agents: ["claude", "omniroute"], route: "/seo" },
  { name: "Studio", blurb: "Video, music, thumbnails, games.", agents: ["claude", "grok"], route: "/video" },
  { name: "Research", blurb: "Reads more than you have time to.", agents: ["claude", "sakana", "local"], route: "/radar" },
  { name: "Operations", blurb: "Boards, loops and the daily brief.", agents: ["claude", "hermes", "openclaw"], route: "/pipeline" },
];

export default function PaperclipPage() {
  const { data } = useJson<Vitals>("/api/vitals", { pollMs: 60_000 });
  const { doc, setDoc } = useBoard<{ orders: Order[] }>("paperclip", { orders: [] });
  const [tab, setTab] = useState("Company");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [dept, setDept] = useState(DEPARTMENTS[0].name);

  const composed = interim ? `${text} ${interim}`.trim() : text;
  const orders = doc.orders ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Orchestration"
        icon="Building2"
        accent="#d4a574"
        title="Paperclip"
        subtitle="The company view: who works here, which department owns what, and what the workforce actually shipped."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Headcount" value={data ? `${data.agents.connected}/${data.agents.total}` : "—"} icon="Users" accent="var(--gold)" />
        <Stat label="Sessions today" value={data?.work.sessionsToday ?? "—"} icon="Activity" accent="var(--cyan)" />
        <Stat
          label="Output"
          value={data ? compact(data.work.usage.outputTokens) : "—"}
          hint="tokens written across recent sessions"
          icon="PenLine"
          accent="var(--violet)"
        />
        <Stat label="Goals open" value={data?.goals.open ?? "—"} hint={`${data?.goals.done ?? 0} done`} icon="Target" accent="var(--emerald)" />
      </div>

      <Tabs tabs={["Company", "Departments", "Standing orders"]} active={tab} onChange={setTab} />

      {tab === "Company" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Shipped recently" subtitle="Workspace projects with files on disk" padded={false}>
            {data?.work.projects.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {data.work.projects.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="mono min-w-0 flex-1 truncate text-[var(--fg-soft)]">{p.name}</span>
                    <span className="text-[11px] text-[var(--fg-mute)]">
                      {p.files} file{p.files === 1 ? "" : "s"} · {relTime(p.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="Package" title="Nothing shipped yet" body="Anything an agent builds shows up here." />
            )}
          </Panel>

          <Panel title="Last briefings" subtitle="Most recent agent sessions" padded={false}>
            {data?.work.recent.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {data.work.recent.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <p className="truncate text-[13px] text-[var(--fg-soft)]">{s.firstPrompt || "(no prompt captured)"}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--fg-mute)]">
                      {s.project} · {relTime(s.updatedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="FileText" title="No sessions read" />
            )}
          </Panel>
        </div>
      )}

      {tab === "Departments" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((d) => (
            <Link key={d.name} href={d.route} className="panel panel-hover p-4">
              <h3 className="text-[14px] font-semibold">{d.name}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">{d.blurb}</p>
              <div className="mt-3 flex items-center gap-1.5">
                {d.agents.map((id) => {
                  const spec = AGENTS.find((a) => a.id === id);
                  const connected = data?.agents.statuses.find((s) => s.id === id)?.connected;
                  return (
                    <span key={id} title={`${spec?.name}${connected ? "" : " (not connected)"}`} style={{ opacity: connected ? 1 : 0.35 }}>
                      <AgentAvatar agent={id} size={22} />
                    </span>
                  );
                })}
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "Standing orders" && (
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <label htmlFor="order-text" className="eyebrow mb-1.5 block">
                  New standing order
                </label>
                <input
                  id="order-text"
                  value={composed}
                  onChange={(e) => {
                    setInterim("");
                    setText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && composed.trim()) {
                      setDoc({ orders: [{ id: `o_${Date.now()}`, text: composed.trim(), department: dept, at: Date.now() }, ...orders] });
                      setText("");
                      setInterim("");
                    }
                  }}
                  placeholder="Never publish anything without a source link…"
                  className="input"
                />
              </div>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="input !w-auto">
                {DEPARTMENTS.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
              <VoiceButton
                size={40}
                onTranscript={(t, o) => {
                  if (o.final) {
                    setInterim("");
                    setText((prev) => (prev ? `${prev} ${t}` : t));
                  } else {
                    setInterim(t);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!composed.trim()) return;
                  setDoc({ orders: [{ id: `o_${Date.now()}`, text: composed.trim(), department: dept, at: Date.now() }, ...orders] });
                  setText("");
                  setInterim("");
                }}
                disabled={!composed.trim()}
                className="btn btn-primary h-[40px]"
              >
                <Plus size={15} /> Add
              </button>
            </div>
            <p className="mt-3 text-[11.5px] text-[var(--fg-mute)]">
              Standing orders are house rules you keep to hand — paste them into a brief when it matters.
            </p>
          </Panel>

          <Panel padded={false}>
            {orders.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {orders.map((o) => (
                  <li key={o.id} className="group flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-[var(--fg-soft)]">{o.text}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--fg-mute)]">
                        {o.department} · {relTime(o.at)}
                      </p>
                    </div>
                    <button
                      onClick={() => setDoc({ orders: orders.filter((x) => x.id !== o.id) })}
                      className="btn btn-ghost !px-2 opacity-0 transition group-hover:opacity-100"
                      aria-label="Delete order"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="ScrollText" title="No standing orders" body="The rules you would otherwise repeat in every prompt." />
            )}
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
