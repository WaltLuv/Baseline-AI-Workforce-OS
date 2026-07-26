"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { AGENTS, type AgentStatus } from "@/lib/agents";
import { FEATURES, type FeatureStatus } from "@/lib/features";
import { useJson } from "@/lib/client";
import AgentAvatar from "@/components/AgentAvatar";
import { Icon, PageHeader, PageShell, Panel, Stat, StatusPill } from "@/components/ui";

interface AgentsResponse {
  statuses: AgentStatus[];
}
interface FeaturesResponse {
  statuses: FeatureStatus[];
}
interface ConfigResponse {
  config: { vaultRoot: string | null; workspaceRoot: string; claudeModel: string };
  configPath: string;
  home: string;
}

export default function SetupPage() {
  const { data: agents, loading, refresh } = useJson<AgentsResponse>("/api/agents?probe=1");
  const { data: features } = useJson<FeaturesResponse>("/api/features");
  const { data: cfg } = useJson<ConfigResponse>("/api/config");

  const connected = agents?.statuses.filter((s) => s.connected).length ?? 0;
  const featureReady = features?.statuses.filter((s) => s.ready).length ?? 0;

  const missingRequirements = (features?.statuses ?? [])
    .flatMap((s) => s.requirements.filter((r) => !r.met).map((r) => ({ ...r, feature: s.id })))
    .filter((r, i, all) => all.findIndex((x) => x.label === r.label) === i);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Self"
        icon="Rocket"
        accent="#f97316"
        title="Setup"
        subtitle="What is connected, what is not, and the exact command that fixes each gap. Nothing here is required to boot — the dashboard runs with none of it."
        actions={
          <button onClick={() => void refresh()} className="btn">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Re-check
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Agents connected" value={`${connected}/${AGENTS.length}`} icon="Users" accent="var(--gold)" />
        <Stat label="Features ready" value={`${featureReady}/${FEATURES.length}`} icon="CircleCheck" accent="var(--emerald)" />
        <Stat
          label="Config file"
          value={cfg ? "Written" : "—"}
          hint={cfg?.configPath}
          icon="FileCog"
          accent="var(--violet)"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Agents" subtitle="Detected on this machine right now" padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {AGENTS.map((a) => {
              const status = agents?.statuses.find((s) => s.id === a.id);
              return (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <AgentAvatar agent={a.id} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/agents/${a.id}`} className="truncate text-[13.5px] font-medium hover:underline">
                          {a.name}
                        </Link>
                        <StatusPill ready={Boolean(status?.connected)} />
                      </div>
                      <p className="mono mt-0.5 truncate text-[11px] text-[var(--fg-mute)]" title={status?.detail}>
                        {status?.detail ?? "checking…"}
                      </p>
                    </div>
                  </div>
                  {!status?.connected && (
                    <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-2.5 text-[11px] text-[var(--fg-dim)]">
                      {a.install}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="Pages" subtitle="Which surfaces are wired up" padded={false}>
            <ul className="divide-y divide-[var(--line)]">
              {FEATURES.map((f) => {
                const status = features?.statuses.find((s) => s.id === f.id);
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={f.route} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <span style={{ color: f.accent }}>
                        <Icon name={f.icon} size={15} />
                      </span>
                      <span className="truncate text-[13px]">{f.title}</span>
                    </Link>
                    <StatusPill ready={status?.ready ?? f.worksOffline} label={status?.ready ?? f.worksOffline ? "Ready" : "Needs setup"} />
                  </li>
                );
              })}
            </ul>
          </Panel>

          {missingRequirements.length > 0 && (
            <Panel title="Everything still missing" subtitle="One line each — run what you actually want">
              <div className="space-y-3">
                {missingRequirements.map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-[var(--fg-soft)]">{r.label}</span>
                      <span className="text-[11px] text-[var(--fg-mute)]">{r.detail}</span>
                    </div>
                    <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-2.5 text-[11px] text-[var(--fg-dim)]">
                      {r.install}
                    </pre>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Where things live">
            <dl className="space-y-2 text-[12px]">
              {[
                ["Config", cfg?.configPath ?? "—"],
                ["Data", cfg?.home ?? "—"],
                ["Workspace", cfg?.config.workspaceRoot ?? "—"],
                ["Vault", cfg?.config.vaultRoot ?? "not set"],
                ["Claude model", cfg?.config.claudeModel ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-[var(--fg-mute)]">{k}</dt>
                  <dd className="mono min-w-0 break-all text-right text-[var(--fg-dim)]">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/settings" className="btn mt-4">
              Open settings
            </Link>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
