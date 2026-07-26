"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { motion } from "framer-motion";
import { FolderOpen, RefreshCw, Terminal } from "lucide-react";
import { AGENT_BY_ID, type AgentStatus } from "@/lib/agents";
import { useJson } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import ChatView from "@/components/ChatView";
import HermesPantheon from "@/components/HermesPantheon";
import PhonePanel from "@/components/PhonePanel";
import VoiceLive from "@/components/VoiceLive";
import { EmptyState, Panel, StatusPill, Tabs, relTime } from "@/components/ui";

interface AgentsResponse {
  statuses: AgentStatus[];
}
interface WorkspaceResponse {
  project: string;
  root: string;
  files: { rel: string; size: number; updatedAt: number }[];
}

const SUGGESTIONS: Record<string, string[]> = {
  claude: ["What did I work on last?", "Audit this repo for dead code", "Write a plan for today's build"],
  codex: ["Review the diff on my current branch", "Write tests for the last file I edited"],
  openclaw: ["Show me the swarm status", "Spin up a research task"],
  hermes: ["Which persona should handle outreach?", "Summarise what you remember about me"],
  local: ["Summarise this in three bullets", "Rewrite this paragraph, plainer"],
  fusion: ["Which database should I use for this app?", "Critique my launch plan"],
};

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const spec = AGENT_BY_ID[id];
  if (!spec) notFound();

  const [tab, setTab] = useState("Chat");
  const { data, refresh } = useJson<AgentsResponse>("/api/agents?probe=1", { pollMs: 60_000 });
  const project = `${spec.id}-workspace`;
  const { data: ws, refresh: refreshWs } = useJson<WorkspaceResponse>(
    tab === "Workspace" ? `/api/workspace?project=${project}` : null,
  );

  const status = useMemo(() => data?.statuses.find((s) => s.id === spec.id) ?? null, [data, spec.id]);

  // Hermes carries surfaces the other agents do not have: the persona pantheon
  // it loads from disk, and the phone bridge for driving it away from the desk.
  const tabs = useMemo(
    () =>
      spec.id === "hermes"
        ? ["Chat", "Voice", "Pantheon", "Phone", "Workspace", "About"]
        : ["Chat", "Voice", "Workspace", "About"],
    [spec.id],
  );

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
            <Tabs tabs={tabs} active={tab} onChange={setTab} />
          </div>
        </div>
      </header>

      {tab === "Chat" && (
        <div className="relative flex min-h-0 flex-1 flex-col px-4 md:px-8">
          <ChatView spec={spec} status={status} suggestions={SUGGESTIONS[spec.id] ?? []} />
        </div>
      )}

      {tab === "Voice" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <VoiceLive agentId={spec.id} agentName={spec.name} />
          </div>
        </div>
      )}

      {tab === "Pantheon" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <HermesPantheon />
          </div>
        </div>
      )}

      {tab === "Phone" && (
        <div className="scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <PhonePanel />
          </div>
        </div>
      )}

      {tab === "Workspace" && (
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

      {tab === "About" && (
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
