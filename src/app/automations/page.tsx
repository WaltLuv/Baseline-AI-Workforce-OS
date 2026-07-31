"use client";

import Link from "next/link";
import { useJson } from "@/lib/client";
import { EmptyState, PageHeader, PageShell, Panel, Stat, StatusPill, relTime } from "@/components/ui";

const ACCENT = "#fda4af";

interface AutomationRow {
  name: string;
  source: "claude" | "crontab" | "launchd" | "workforce";
  cadence: string;
  detail: string;
  updatedAt: number;
  status: "installed" | "generated" | "unknown";
}

const SOURCE_COLOR: Record<string, string> = {
  claude: "#d97757",
  crontab: "#4ade80",
  launchd: "#60a5fa",
  workforce: "#a78bfa",
};

export default function AutomationsPage() {
  const { data, refresh } = useJson<{ automations: AutomationRow[] }>("/api/automations", { pollMs: 60_000 });
  const rows = data?.automations ?? [];
  const installed = rows.filter((r) => r.status === "installed").length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="System · Scheduled tasks"
        title="Automations"
        subtitle="Every scheduled job this machine knows about — Claude tasks, launchd, crontab, and the files this app generated. Read-only: nothing is installed or removed from here."
        accent={ACCENT}
        icon="AlarmClock"
        actions={<button className="btn" onClick={() => void refresh()}>Refresh</button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Jobs found" value={data ? rows.length : "—"} icon="AlarmClock" accent={ACCENT} />
        <Stat label="Installed" value={data ? installed : "—"} icon="CircleCheck" accent="var(--emerald)" />
        <Stat
          label="Generated, not installed"
          value={data ? rows.filter((r) => r.status === "generated").length : "—"}
          hint="files this app wrote that you haven't loaded yet"
          icon="FileClock"
          accent="#fbbf24"
        />
      </div>

      <Panel padded={false}>
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {rows.map((r, i) => (
              <li key={`${r.source}-${r.name}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span
                  className="pill shrink-0 !text-[10px]"
                  style={{ color: SOURCE_COLOR[r.source], borderColor: `color-mix(in oklab, ${SOURCE_COLOR[r.source]} 35%, transparent)` }}
                >
                  {r.source}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--fg-soft)]">{r.name}</span>
                  <span className="mono block truncate text-[10.5px] text-[var(--fg-mute)]">{r.detail}</span>
                </span>
                <span className="mono shrink-0 text-[11px] text-[var(--fg-dim)]">{r.cadence}</span>
                {r.updatedAt > 0 && <span className="shrink-0 text-[11px] text-[var(--fg-mute)]">{relTime(r.updatedAt)}</span>}
                <StatusPill ready={r.status === "installed"} label={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="AlarmClock"
            title="No scheduled jobs found"
            body="Generate the daily Dream schedule from the Dream page, or add jobs to ~/.claude/tasks, launchd, or your crontab."
          />
        )}
      </Panel>
      <p className="mt-4 text-[11.5px] text-[var(--fg-mute)]">
        The daily Dream Review schedule is generated on the{" "}
        <Link href="/dream" className="underline decoration-dotted">
          Dream page
        </Link>
        .
      </p>
    </PageShell>
  );
}
