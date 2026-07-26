"use client";

import { useState } from "react";
import { useJson } from "@/lib/client";
import type { McpServer, SkillInfo } from "@/lib/claudeData";
import { EmptyState, PageHeader, PageShell, Panel, Stat, Tabs, relTime } from "@/components/ui";

interface SkillsResponse {
  skills: SkillInfo[];
  mcp: McpServer[];
}

const SOURCE_COLOUR: Record<string, string> = {
  user: "var(--gold)",
  project: "var(--emerald)",
  plugin: "var(--violet)",
};

export default function SkillsPage() {
  const { data } = useJson<SkillsResponse>("/api/skills", { pollMs: 120_000 });
  const [tab, setTab] = useState("Fleet");
  const [query, setQuery] = useState("");

  const skills = (data?.skills ?? []).filter(
    (s) => !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Command"
        icon="Zap"
        accent="#a3e635"
        title="Skills"
        subtitle="What your agents can actually call, read from disk — user, project and plugin scopes, plus the MCP servers they can reach."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Skills" value={data?.skills.length ?? "—"} icon="Zap" accent="#a3e635" />
        <Stat label="MCP servers" value={data?.mcp.length ?? "—"} icon="Plug" accent="var(--cyan)" />
        <Stat
          label="Scopes"
          value={new Set((data?.skills ?? []).map((s) => s.source)).size || "—"}
          hint="user · project · plugin"
          icon="Layers"
          accent="var(--violet)"
        />
      </div>

      <Tabs tabs={["Fleet", "MCP servers"]} active={tab} onChange={setTab} />

      {tab === "Fleet" && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter skills…"
            className="input mb-4"
            aria-label="Filter skills"
          />
          {skills.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {skills.map((s) => (
                <div key={s.path} className="panel panel-hover p-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="truncate text-[14px] font-semibold">{s.name}</h3>
                    <span className="pill !py-0.5 !text-[10px]" style={{ color: SOURCE_COLOUR[s.source] ?? "var(--fg-dim)" }}>
                      {s.source}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">{s.description}</p>
                  <p className="mono mt-2.5 truncate text-[10.5px] text-[var(--fg-mute)]" title={s.path}>
                    {s.path} · {relTime(s.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon="Zap"
                title="No skills found"
                body="Skills live in ~/.claude/skills or .claude/skills in a project, each in a folder with a SKILL.md."
              />
            </Panel>
          )}
        </>
      )}

      {tab === "MCP servers" && (
        <Panel padded={false}>
          {data?.mcp.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {data.mcp.map((m) => (
                <li key={`${m.scope}-${m.name}`} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium">{m.name}</span>
                    <span className="pill !py-0.5 !text-[10px]">{m.scope}</span>
                  </div>
                  <p className="mono mt-1 truncate text-[11px] text-[var(--fg-mute)]" title={m.command}>
                    {m.command}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="Plug"
              title="No MCP servers registered"
              body="Add one with: claude mcp add <name> -- <command>"
            />
          )}
        </Panel>
      )}
    </PageShell>
  );
}
