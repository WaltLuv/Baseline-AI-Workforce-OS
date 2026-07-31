"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { motion } from "framer-motion";
import { FolderOpen, RefreshCw, Terminal } from "lucide-react";
import { AGENT_BY_ID, type AgentSpec, type AgentStatus } from "@/lib/agents";
import { useJson } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import ChatView from "@/components/ChatView";
import HermesPantheon from "@/components/HermesPantheon";
import OmpPanels from "@/components/OmpPanels";
import HiggsfieldPanels from "@/components/HiggsfieldPanels";
import MissionRunner from "@/components/MissionRunner";
import PhonePanel from "@/components/PhonePanel";
import VoiceLive from "@/components/VoiceLive";
import { EmptyState, Panel, StatusPill, Tabs, relTime } from "@/components/ui";

interface AgentsResponse {
  agents: AgentSpec[];
  statuses: AgentStatus[];
}
interface WorkspaceResponse {
  project: string;
  root: string;
  files: { rel: string; size: number; updatedAt: number }[];
}

const SUGGESTIONS: Record<string, string[]> = {
  claude: ["What did I work on last?", "Audit this repo for dead code", "Write a plan for today's build"],
  ohmypi: ["Reply with exactly: OMP_OK", "List the tools you have available", "Refactor the file I paste next"],
  codex: ["Review the diff on my current branch", "Write tests for the last file I edited"],
  openclaw: ["Show me the swarm status", "Spin up a research task"],
  hermes: ["Which persona should handle outreach?", "Summarise what you remember about me"],
  local: ["Summarise this in three bullets", "Rewrite this paragraph, plainer"],
  fusion: ["Which database should I use for this app?", "Critique my launch plan"],
};

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState("Chat");
  const { data, refresh } = useJson<AgentsResponse>("/api/agents?probe=1", { pollMs: 60_000 });

  // Custom (config-defined) agents aren't in the compiled registry — they
  // arrive with the /api/agents payload.
  const spec = AGENT_BY_ID[id] ?? data?.agents.find((a) => a.id === id);
  const project = `${id}-workspace`;
  const { data: ws, refresh: refreshWs } = useJson<WorkspaceResponse>(
    // Raw `tab` here on purpose: activeTab is derived below the spec guard,
    // and "Workspace" exists in every tab set.
    tab === "Workspace" && spec ? `/api/workspace?project=${project}` : null,
  );
  const status = useMemo(() => data?.statuses.find((s) => s.id === id) ?? null, [data, id]);

  if (!AGENT_BY_ID[id] && data && !spec) notFound();
  if (!spec) {
    return <div className="p-8 text-[13px] text-[var(--fg-mute)]">Looking up agent…</div>;
  }

  // Some agents carry surfaces the others do not: Hermes has its persona
  // pantheon and phone bridge; Oh My Pi exposes the harness state it keeps
  // under ~/.omp. Plain computation — it must live below the spec guard, so
  // it can't be a hook.
  const tabs =
    spec.id === "hermes"
      ? ["Chat", "Voice", "Pantheon", "Phone", "Workspace", "About"]
      : spec.id === "ohmypi"
        ? ["Orchestrate", "Chat", "Voice", "Skills", "Harness", "Status", "Workspace", "About"]
        : spec.id === "higgsfield"
          ? ["Studio", "Provider", "MCP", "Workspace", "About"]
          : ["Chat", "Voice", "Workspace", "About"];
  // Agents without a Chat tab (Higgsfield) land on their first tab instead.
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--line)] px-5 pb-3 pt-5 md:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <AgentAvatar agent={spec.id} size={42} />
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[19px]">{spec.name}</h1>
                  <StatusPill ready={Boolean(status?.connected)} />
                </div>
                <p className="mt-0.5 text-[12.5px] text-[var(--fg-dim)]">{spec.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void refresh()} className="btn btn-ghost !px-2.5" title="Re-check this agent">
                <RefreshCw size={14} />
              </button>
              <Link href="/setup" className="btn">
                Setup
              </Link>
            </div>
          </div>

          <div className="mt-3">
            <Tabs tabs={tabs} active={activeTab} onChange={setTab} />
          </div>
        </div>
      </header>

      {activeTab === "Chat" && (
        <div className="relative flex min-h-0 flex-1 flex-col px-4 md:px-8">
          <ChatView spec={spec} status={status} suggestions={SUGGESTIONS[spec.id] ?? []} />
        </div>
      )}

      {activeTab === "Voice" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <VoiceLive agentId={spec.id} agentName={spec.name} />
          </div>
        </div>
      )}

      {activeTab === "Pantheon" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <HermesPantheon />
          </div>
        </div>
      )}

      {activeTab === "Phone" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <PhonePanel />
          </div>
        </div>
      )}

      {activeTab === "Orchestrate" && spec.id === "ohmypi" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <MissionRunner />
          </div>
        </div>
      )}

      {(activeTab === "Studio" || activeTab === "Provider" || activeTab === "MCP") && spec.id === "higgsfield" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <HiggsfieldPanels view={activeTab as "Studio" | "Provider" | "MCP"} />
          </div>
        </div>
      )}

      {(activeTab === "Skills" || activeTab === "Harness" || activeTab === "Status") && spec.id === "ohmypi" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <OmpPanels view={activeTab as "Skills" | "Harness" | "Status"} />
          </div>
        </div>
      )}

      {activeTab === "Workspace" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl space-y-4">
            <Panel
              title={`Project · ${project}`}
              subtitle={ws?.root ?? "Everything this agent writes lands here"}
              actions={
                <button onClick={() => void refreshWs()} className="btn btn-ghost !px-2.5">
                  <RefreshCw size={13} />
                </button>
              }
              padded={false}
            >
              {ws?.files?.length ? (
                <ul className="divide-y divide-[var(--line)]">
                  {ws.files.map((f) => (
                    <li key={f.rel} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="mono min-w-0 flex-1 truncate text-[var(--fg-soft)]">{f.rel}</span>
                      <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">
                        {(f.size / 1024).toFixed(1)} kB · {relTime(f.updatedAt)}
                      </span>
                      <a
                        href={`/api/preview/${project}/${f.rel}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost !px-2 !py-1 text-[11.5px]"
                      >
                        <FolderOpen size={12} /> Open
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="FolderOpen"
                  title="No files yet"
                  body={`Ask ${spec.name} to build something and anything it writes shows up here.`}
                />
              )}
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "About" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-4xl space-y-4"
          >
            <Panel title="What it is">
              <p className="text-[13.5px] leading-relaxed text-[var(--fg-soft)]">{spec.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {spec.capabilities.map((c) => (
                  <span key={c} className="pill">
                    {c}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title="Connection">
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="eyebrow mb-1">State</dt>
                  <dd>
                    <StatusPill ready={Boolean(status?.connected)} />
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Backend</dt>
                  <dd className="text-[var(--fg-soft)]">{spec.backend === "cli" ? "local CLI process" : "HTTP endpoint"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="eyebrow mb-1">Detail</dt>
                  <dd className="mono break-all text-[var(--fg-dim)]">{status?.detail ?? "checking…"}</dd>
                </div>
                {status?.version && (
                  <div className="sm:col-span-2">
                    <dt className="eyebrow mb-1">Version</dt>
                    <dd className="mono text-[var(--fg-dim)]">{status.version}</dd>
                  </div>
                )}
              </dl>
            </Panel>

            <Panel title="Install / connect">
              <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3.5 text-[var(--fg-soft)]">
                {spec.install}
              </pre>
              {spec.docsUrl && (
                <a href={spec.docsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost mt-3 !px-2">
                  <Terminal size={13} /> Docs
                </a>
              )}
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--fg-mute)]">
                Wrong flags for your version? Override the command in Settings — no source edit needed.
              </p>
            </Panel>
          </motion.div>
        </div>
      )}
    </div>
  );
}
