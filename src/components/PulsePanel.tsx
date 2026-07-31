"use client";

/**
 * "Today at a glance" — operator score, spend, subscriptions, usage windows.
 *
 * Honesty rules baked in: subscription prices are the ones you entered (never
 * guessed), token costs come from real session transcripts, plan caps are not
 * invented, and a missing OpenRouter key shows setup-needed rather than $0.00.
 */

import { useState } from "react";
import Link from "next/link";
import { useJson } from "@/lib/client";
import { Icon, Panel, StatusPill, alpha } from "@/components/ui";

interface ScoreComponent {
  label: string;
  detail: string;
  value: number;
  weight: number;
}
interface Pulse {
  operator: { score: number; band: string; components: ScoreComponent[] };
  subscriptions: { id: string; name: string; provider?: string; monthlyPriceUsd: number; note?: string }[];
  flatMonthlyUsd: number;
  spendWindows: { label: string; days: number; subscriptionsUsd: number; tokenCostUsd: number; a2aCostUsd: number; totalUsd: number }[];
  apiEquivalentUsd28: number;
  usageWindows: { label: string; sessions: number; messages: number; tokens: number }[];
  openrouter: {
    state: "ok" | "setup-needed" | "error";
    detail: string;
    label?: string | null;
    usageUsd?: number;
    limitUsd?: number | null;
    remainingUsd?: number | null;
  };
}

const BAND_COLOR: Record<string, string> = {
  "On fire": "var(--gold)",
  Healthy: "var(--emerald)",
  Warming: "#fbbf24",
  Cold: "var(--fg-mute)",
};

export default function PulsePanel() {
  const { data } = useJson<Pulse>("/api/pulse", { pollMs: 120_000 });
  const [win, setWin] = useState(1); // index into spendWindows — default "7 days"

  if (!data) return null;
  const spend = data.spendWindows[win] ?? data.spendWindows[0];
  const scoreColor = BAND_COLOR[data.operator.band] ?? "var(--fg-dim)";
  const roi =
    data.flatMonthlyUsd > 0 && data.apiEquivalentUsd28 > 0
      ? (data.apiEquivalentUsd28 / ((data.flatMonthlyUsd / 30) * 28)).toFixed(1)
      : null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow">Today at a glance</h2>
        <div className="inline-flex gap-1 rounded-lg border border-[var(--line)] p-0.5">
          {data.spendWindows.map((w, i) => (
            <button
              key={w.label}
              onClick={() => setWin(i)}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium transition"
              style={{
                background: i === win ? "rgba(244,239,230,0.09)" : "transparent",
                color: i === win ? "var(--fg)" : "var(--fg-mute)",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {/* Operator score */}
        <Panel className="panel-hover">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">Operator score</span>
            <Icon name="Gauge" size={15} className="text-[var(--fg-mute)]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-semibold leading-none tracking-tight" style={{ color: scoreColor }}>
              {data.operator.score}
            </span>
            <span className="text-[12px] font-medium" style={{ color: scoreColor }}>
              {data.operator.band}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {data.operator.components.map((c) => (
              <div key={c.label} title={c.detail} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[10.5px] text-[var(--fg-mute)]">{c.label}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: alpha(scoreColor, 12) }}>
                  <span className="block h-full rounded-full" style={{ width: `${c.value * 100}%`, background: alpha(scoreColor, 65) }} />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* AI spend */}
        <Panel className="panel-hover">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">AI spend · {spend.label.toLowerCase()}</span>
            <Icon name="Coins" size={15} className="text-[var(--fg-mute)]" />
          </div>
          <div className="text-[30px] font-semibold leading-none tracking-tight text-[var(--gold)]">
            ${spend.totalUsd.toFixed(spend.totalUsd >= 100 ? 0 : 2)}
          </div>
          <div className="mt-2 space-y-1 text-[11.5px] text-[var(--fg-mute)]">
            <div>subscriptions ${spend.subscriptionsUsd.toFixed(2)} · pro-rated from your prices</div>
            <div>
              tokens ${spend.tokenCostUsd.toFixed(2)}
              {spend.a2aCostUsd > 0 ? ` · A2A $${spend.a2aCostUsd.toFixed(2)} (included)` : ""}
            </div>
            {roi && <div>API-equivalent 28d: ${data.apiEquivalentUsd28.toFixed(2)} · {roi}× the flat spend</div>}
          </div>
          {data.subscriptions.length === 0 && (
            <p className="mt-2 text-[11.5px] text-[var(--fg-mute)]">
              $0 shown because no subscriptions are entered yet —{" "}
              <Link href="/settings" className="underline decoration-dotted">
                add yours in Settings
              </Link>
              .
            </p>
          )}
        </Panel>

        {/* Subscriptions */}
        <Panel className="panel-hover" padded={false}>
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="eyebrow">Subscriptions</span>
            <span className="text-[12px] font-semibold text-[var(--fg-soft)]">${data.flatMonthlyUsd}/mo</span>
          </div>
          {data.subscriptions.length ? (
            <ul className="mt-2 divide-y divide-[var(--line)] pb-1">
              {data.subscriptions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-[var(--fg-soft)]">{s.name}</span>
                    {s.provider && <span className="block text-[10.5px] text-[var(--fg-mute)]">{s.provider}</span>}
                  </span>
                  <span className="mono shrink-0 text-[12px] text-[var(--fg-dim)]">
                    {s.monthlyPriceUsd ? `$${s.monthlyPriceUsd}/mo` : (s.note ?? "credit")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-[11.5px] leading-relaxed text-[var(--fg-mute)]">
              Your flat-fee AI plans (Claude Max, ChatGPT Plus…) — enter them once in Settings and the spend maths uses
              real numbers. This is a personal ledger; nothing here is a paywall.
            </p>
          )}
        </Panel>

        {/* Live usage + OpenRouter */}
        <Panel className="panel-hover" padded={false}>
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="eyebrow">Live usage</span>
            <Icon name="Timer" size={14} className="text-[var(--fg-mute)]" />
          </div>
          <ul className="mt-2 space-y-1.5 px-4">
            {data.usageWindows.map((w) => (
              <li key={w.label} className="flex items-center justify-between text-[11.5px]">
                <span className="text-[var(--fg-mute)]">{w.label}</span>
                <span className="mono text-[var(--fg-dim)]">
                  {w.sessions}s · {w.messages}m · {(w.tokens / 1000).toFixed(0)}k tok
                </span>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[10px] text-[var(--fg-mute)]">from session activity on disk — plan caps are not guessed</p>
          <div className="mt-2 border-t border-[var(--line)] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--fg-mute)]">OpenRouter credit</span>
              {data.openrouter.state === "ok" ? (
                <span className="mono text-[12px] text-[var(--emerald)]">
                  {data.openrouter.remainingUsd !== null && data.openrouter.remainingUsd !== undefined
                    ? `$${data.openrouter.remainingUsd.toFixed(2)} left`
                    : `$${(data.openrouter.usageUsd ?? 0).toFixed(2)} used`}
                </span>
              ) : (
                <StatusPill ready={false} label={data.openrouter.state === "error" ? "Error" : "Setup needed"} />
              )}
            </div>
            <p className="mt-1 text-[10px] text-[var(--fg-mute)]">{data.openrouter.detail}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
