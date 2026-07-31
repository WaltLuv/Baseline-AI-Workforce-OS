"use client";

import { useMemo, useState } from "react";
import { useJson } from "@/lib/client";
import type { Integration, IntegrationStatus } from "@/lib/integrations";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Stat, StatusPill, Tabs } from "@/components/ui";

const ACCENT = "var(--cyan)";
const TABS = ["Catalog", "Notion", "Pinecone", "Higgsfield"];

interface Payload {
  integrations: Integration[];
  statuses: IntegrationStatus[];
}

export default function IntegrationsPage() {
  const [tab, setTab] = useState(TABS[0]);
  const { data, refresh } = useJson<Payload>("/api/integrations", { pollMs: 45_000 });

  const statusById = useMemo(() => {
    const m: Record<string, IntegrationStatus> = {};
    for (const s of data?.statuses ?? []) m[s.id] = s;
    return m;
  }, [data]);

  const connected = data?.statuses.filter((s) => s.connected).length ?? 0;

  return (
    <PageShell>
      <PageHeader
        eyebrow="System · What's plugged into your stack"
        title="Integrations"
        subtitle="Every external service the workforce can use, with its live connection state. A missing key never breaks a page — it just means that panel says so."
        accent={ACCENT}
        icon="Plug"
        actions={
          <button className="btn" onClick={() => void refresh()}>
            Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Connected" value={data ? `${connected}/${data.integrations.length}` : "—"} icon="Plug" accent={ACCENT} />
        <Stat label="Where keys live" value="Credentials page" hint="env → 1Password → local file, one resolution order" icon="KeyRound" accent="var(--gold)" />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Catalog" && <CatalogTab data={data} statusById={statusById} />}
      {tab === "Notion" && <NotionTab />}
      {tab === "Pinecone" && <PineconeTab />}
      {tab === "Higgsfield" && <HiggsfieldTab />}
    </PageShell>
  );
}

function CatalogTab({ data, statusById }: { data: Payload | null; statusById: Record<string, IntegrationStatus> }) {
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Checking services…</p></Panel>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.integrations.map((i) => {
        const s = statusById[i.id];
        return (
          <Panel key={i.id} className="panel-hover">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-medium">{i.label}</span>
              <StatusPill ready={Boolean(s?.connected)} label={s?.connected ? "Connected" : "Setup needed"} />
            </div>
            <p className="text-[12.5px] leading-relaxed text-[var(--fg-dim)]">{i.adds}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">Without it: {i.withoutIt}</p>
            {!s?.connected && (
              <pre className="mono mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.5)] p-2.5 text-[11px] text-[var(--fg-dim)]">
                {i.install}
              </pre>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <a href={i.docsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost !px-2 !py-1 text-[11.5px]">
                <Icon name="ExternalLink" size={11} /> Docs
              </a>
              <span className="mono text-[10.5px] text-[var(--fg-mute)]">{s?.detail}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

interface PineconePayload {
  state: "ok" | "setup-needed" | "error";
  detail: string;
  indexes: { name: string; dimension: number | null; metric: string | null; vectors: number | null }[];
  totalVectors: number;
}

function PineconeTab() {
  const { data } = useJson<PineconePayload>("/api/integrations/pinecone");
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Checking Pinecone…</p></Panel>;
  if (data.state !== "ok") {
    return (
      <Panel>
        <EmptyState
          icon="Database"
          title={data.state === "setup-needed" ? "Pinecone not connected" : "Pinecone error"}
          body={data.detail}
        />
      </Panel>
    );
  }
  return (
    <Panel title="Connected vector indexes" subtitle={`${data.detail} · ${data.totalVectors.toLocaleString()} vectors counted`} padded={false}>
      <ul className="divide-y divide-[var(--line)]">
        {data.indexes.map((i) => (
          <li key={i.name} className="flex items-center gap-3 px-5 py-3">
            <span className="mono min-w-0 flex-1 truncate text-[13px] text-[var(--fg-soft)]">{i.name}</span>
            <span className="text-[11.5px] text-[var(--fg-mute)]">
              {i.dimension ? `${i.dimension}d` : ""} {i.metric ?? ""}
            </span>
            <span className="mono text-[12px] text-[var(--fg-dim)]">
              {i.vectors !== null ? `${i.vectors.toLocaleString()} vectors` : "count unavailable"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

interface NotionPayload {
  state: "ok" | "setup-needed" | "error";
  detail: string;
  pages: { id: string; title: string; url: string; lastEdited: string }[];
}

function NotionTab() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data } = useJson<NotionPayload>(
    submitted ? `/api/integrations/notion?q=${encodeURIComponent(submitted)}` : "/api/integrations/notion",
  );
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Checking Notion…</p></Panel>;
  if (data.state !== "ok") {
    return (
      <Panel>
        <EmptyState icon="NotebookText" title={data.state === "setup-needed" ? "Notion not connected" : "Notion error"} body={data.detail} />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Search your Notion workspace…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(q.trim())}
          />
          <button className="btn btn-primary" onClick={() => setSubmitted(q.trim())}>
            Search
          </button>
        </div>
      </Panel>
      <Panel title={submitted ? `Results for “${submitted}”` : "Recently edited pages"} subtitle={data.detail} padded={false}>
        <ul className="divide-y divide-[var(--line)]">
          {data.pages.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 px-5 py-2.5 transition hover:bg-[rgba(244,239,230,0.04)]">
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--fg-soft)]">{p.title}</span>
                <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{p.lastEdited.slice(0, 10)}</span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

interface HiggsfieldPayload {
  state: "ready" | "credentials_missing" | "setup_required" | "error";
  detail: string;
  credentialsPresent: boolean;
  mcpRegistered: boolean;
  mcpReachable: boolean;
  mcpUrl: string;
  install: string;
}

function HiggsfieldTab() {
  const { data } = useJson<HiggsfieldPayload>("/api/integrations/higgsfield");
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Probing Higgsfield…</p></Panel>;
  return (
    <div className="space-y-4">
      <Panel title="Provider Control Center" subtitle="Claude Code is the studio; Higgsfield plugs in as the provider over MCP" padded={false}>
        <ul className="divide-y divide-[var(--line)]">
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px]">State</span>
            <StatusPill ready={data.state === "ready"} label={data.state.replace(/_/g, " ")} />
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px]">MCP registered with Claude Code</span>
            <StatusPill ready={data.mcpRegistered} label={data.mcpRegistered ? "Registered" : "Not registered"} />
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px]">Endpoint answering ({data.mcpUrl})</span>
            <StatusPill ready={data.mcpReachable} label={data.mcpReachable ? "Reachable" : "No answer"} />
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px]">API keys</span>
            <StatusPill ready={data.credentialsPresent} label={data.credentialsPresent ? "Present" : "Not set"} />
          </li>
        </ul>
      </Panel>
      {!data.mcpRegistered && (
        <Panel title="Connect it">
          <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[rgba(13,10,18,0.6)] p-3 text-[11.5px] text-[var(--fg-soft)]">
            {data.install}
          </pre>
        </Panel>
      )}
      <p className="text-[11.5px] text-[var(--fg-mute)]">
        The full studio — generation briefs, dispatch, results — lives on the Higgsfield agent page.
      </p>
    </div>
  );
}
