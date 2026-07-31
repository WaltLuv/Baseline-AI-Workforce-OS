"use client";

import { useState } from "react";
import { useJson } from "@/lib/client";
import type { McpServer, SkillInfo } from "@/lib/claudeData";
import { EmptyState, Icon, PageHeader, PageShell, Panel, Spinner, Stat, StatusPill, Tabs, relTime } from "@/components/ui";

interface SkillsResponse {
  skills: SkillInfo[];
  mcp: McpServer[];
}

interface RoiRow {
  name: string;
  source: string;
  description: string;
  minutesPerRun: number;
  runsPerMonth: number;
  savedUsdPerMonth: number;
  savedMinutesPerMonth: number;
}
interface RoiPayload {
  roi: {
    hourlyRateUsd: number;
    totalUsdPerMonth: number;
    totalMinutesPerMonth: number;
    configuredCount: number;
    skillCount: number;
    rows: RoiRow[];
  };
  library: {
    indexPath: string;
    indexFound: boolean;
    skills: { slug: string; name: string; category: string; summary: string; origin: string }[];
  };
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
  const { data: roiData, refresh: refreshRoi } = useJson<RoiPayload>(
    tab === "ROI" || tab === "Library" ? "/api/skills/roi" : null,
  );

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

      <Tabs tabs={["Fleet", "ROI", "Library", "MCP servers"]} active={tab} onChange={setTab} />

      {tab === "ROI" && <RoiTab data={roiData} onSaved={refreshRoi} />}
      {tab === "Library" && <LibraryTab data={roiData} />}

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

function RoiTab({ data, onSaved }: { data: RoiPayload | null; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, { minutesPerRun: number; runsPerMonth: number }>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Computing…</p></Panel>;
  const { roi } = data;

  const save = async (name: string) => {
    const d = drafts[name];
    if (!d) return;
    setSavingRow(name);
    await fetch("/api/skills/roi", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...d }),
    });
    setSavingRow(null);
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Time saved value"
          value={`$${roi.totalUsdPerMonth}`}
          hint={
            roi.configuredCount
              ? `${roi.configuredCount}/${roi.skillCount} skills estimated · $${roi.hourlyRateUsd}/hr`
              : `$0 because nothing is estimated yet — honest until you enter numbers`
          }
          icon="PiggyBank"
          accent="var(--gold)"
        />
        <Stat label="Minutes saved / month" value={roi.totalMinutesPerMonth} icon="Timer" accent="var(--emerald)" />
        <Stat label="Skills detected" value={roi.skillCount} hint="click a row to set minutes × runs" icon="Zap" accent="#a3e635" />
      </div>
      <Panel
        title="Per-skill estimates"
        subtitle="minutes-per-run × runs-per-month × your hourly rate — every value starts at 0, nothing is assumed"
        padded={false}
      >
        <ul className="divide-y divide-[var(--line)]">
          {roi.rows.map((r) => {
            const d = drafts[r.name] ?? { minutesPerRun: r.minutesPerRun, runsPerMonth: r.runsPerMonth };
            const dirty = d.minutesPerRun !== r.minutesPerRun || d.runsPerMonth !== r.runsPerMonth;
            return (
              <li key={r.name} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--fg-soft)]">{r.name}</span>
                  <span className="block text-[10.5px] text-[var(--fg-mute)]">{r.source}</span>
                </span>
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-mute)]">
                  min/run
                  <input
                    type="number"
                    min={0}
                    className="input w-16 !py-1 text-[12px]"
                    value={d.minutesPerRun || ""}
                    onChange={(e) => setDrafts((p) => ({ ...p, [r.name]: { ...d, minutesPerRun: Number(e.target.value) || 0 } }))}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-mute)]">
                  runs/mo
                  <input
                    type="number"
                    min={0}
                    className="input w-16 !py-1 text-[12px]"
                    value={d.runsPerMonth || ""}
                    onChange={(e) => setDrafts((p) => ({ ...p, [r.name]: { ...d, runsPerMonth: Number(e.target.value) || 0 } }))}
                  />
                </label>
                <span className="mono w-20 text-right text-[12px]" style={{ color: r.savedUsdPerMonth ? "var(--gold)" : "var(--fg-mute)" }}>
                  ${r.savedUsdPerMonth}/mo
                </span>
                <button className="btn btn-ghost !px-2 !py-1 text-[11.5px]" disabled={!dirty || savingRow === r.name} onClick={() => void save(r.name)}>
                  {savingRow === r.name ? <Spinner size={11} /> : "Save"}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function LibraryTab({ data }: { data: RoiPayload | null }) {
  if (!data) return <Panel><p className="text-[12.5px] text-[var(--fg-mute)]">Reading…</p></Panel>;
  const { library } = data;
  const categories = [...new Set(library.skills.map((s) => s.category))].sort();
  return (
    <div className="space-y-4">
      {!library.indexFound && (
        <Panel>
          <p className="text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
            <Icon name="Info" size={13} className="mr-1 inline" />
            The shared index at <span className="mono">{library.indexPath}</span> is not on this machine, so only the
            12-skill imported catalogue is shown. The full shared library appears automatically once Baseline Agent OS
            has generated its SKILL_INDEX.json.
          </p>
        </Panel>
      )}
      {categories.map((cat) => (
        <Panel key={cat} title={cat} padded={false}>
          <ul className="divide-y divide-[var(--line)]">
            {library.skills
              .filter((s) => s.category === cat)
              .map((s) => (
                <li key={s.slug} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--fg-soft)]">{s.name}</span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--fg-mute)]">{s.summary}</span>
                  </span>
                  <StatusPill ready={s.origin === "shared-index"} label={s.origin === "shared-index" ? "Shared index" : "Imported catalogue"} />
                </li>
              ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
