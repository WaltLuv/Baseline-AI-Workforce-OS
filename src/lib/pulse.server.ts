/**
 * The economics + health pulse behind "Today at a glance" on the home page.
 *
 * Everything here is computed from what is actually on this machine — session
 * transcripts, the A2A ledger, your configured subscription prices — plus one
 * outbound call: the OpenRouter key endpoint, only when a key is configured.
 * Numbers that cannot be known are absent, never invented: subscription prices
 * are user-entered, plan caps are not guessed, and a missing key reports
 * setup-needed instead of $0.00.
 */

import { loadConfig, type SubscriptionEntry } from "./config";
import { listSessions, type SessionSummary } from "./claudeData";
import { readTransactions } from "./a2a.server";
import { readGoals } from "./vaultWriter";
import { resolveSecret } from "./credentials.server";

export interface ScoreComponent {
  label: string;
  detail: string;
  /** 0..1 achieved fraction of this component. */
  value: number;
  /** Points this component contributes at value=1. */
  weight: number;
}

export interface OperatorScore {
  score: number; // 0..100
  band: "Cold" | "Warming" | "Healthy" | "On fire";
  components: ScoreComponent[];
}

export interface SpendWindow {
  label: "Today" | "7 days" | "28 days";
  days: number;
  subscriptionsUsd: number;
  tokenCostUsd: number;
  a2aCostUsd: number;
  totalUsd: number;
}

export interface UsageWindowStat {
  label: string;
  sessions: number;
  messages: number;
  tokens: number;
}

export interface OpenRouterCredit {
  state: "ok" | "setup-needed" | "error";
  detail: string;
  label?: string | null;
  usageUsd?: number;
  limitUsd?: number | null;
  remainingUsd?: number | null;
}

export interface Pulse {
  operator: OperatorScore;
  subscriptions: SubscriptionEntry[];
  flatMonthlyUsd: number;
  spendWindows: SpendWindow[];
  /** Token cost in the last 28 days vs the flat subscription spend — the ROI line. */
  apiEquivalentUsd28: number;
  usageWindows: UsageWindowStat[];
  openrouter: OpenRouterCredit;
  generatedAt: number;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function inWindow(s: SessionSummary, ms: number): boolean {
  return Date.now() - s.updatedAt <= ms;
}

function windowStats(sessions: SessionSummary[], label: string, ms: number): UsageWindowStat {
  const hit = sessions.filter((s) => inWindow(s, ms));
  return {
    label,
    sessions: hit.length,
    messages: hit.reduce((a, s) => a + s.messages, 0),
    tokens: hit.reduce((a, s) => a + s.inputTokens + s.outputTokens, 0),
  };
}

function sessionCostInWindow(sessions: SessionSummary[], ms: number): number {
  return sessions.filter((s) => inWindow(s, ms)).reduce((a, s) => a + (s.costUsd || 0), 0);
}

// ── operator score ──────────────────────────────────────────────────────────

async function operatorScore(sessions: SessionSummary[], a2aCount7d: number): Promise<OperatorScore> {
  const goals = await readGoals().catch(() => []);
  const done = goals.filter((g) => g.done).length;
  const goalRatio = goals.length ? done / goals.length : 0;

  const day = windowStats(sessions, "24h", 86_400_000);
  const week = windowStats(sessions, "7d", 7 * 86_400_000);

  const components: ScoreComponent[] = [
    {
      label: "Worked today",
      detail: `${day.sessions} session${day.sessions === 1 ? "" : "s"} in the last 24h`,
      value: Math.min(1, day.sessions / 3),
      weight: 30,
    },
    {
      label: "Consistent week",
      detail: `${week.sessions} session${week.sessions === 1 ? "" : "s"} in the last 7 days`,
      value: Math.min(1, week.sessions / 10),
      weight: 25,
    },
    {
      label: "Goals moving",
      detail: goals.length ? `${done}/${goals.length} goals done` : "no goals tracked yet",
      value: goals.length ? goalRatio : 0,
      weight: 20,
    },
    {
      label: "Agents delegating",
      detail: a2aCount7d ? `${a2aCount7d} A2A task${a2aCount7d === 1 ? "" : "s"} in 7 days` : "no A2A tasks yet",
      value: Math.min(1, a2aCount7d / 5),
      weight: 15,
    },
    {
      label: "Tools in play",
      detail: `${week.tokens.toLocaleString()} tokens through the workforce this week`,
      value: Math.min(1, week.tokens / 1_000_000),
      weight: 10,
    },
  ];

  const score = Math.round(components.reduce((a, c) => a + c.value * c.weight, 0));
  const band = score >= 80 ? "On fire" : score >= 55 ? "Healthy" : score >= 25 ? "Warming" : "Cold";
  return { score, band, components };
}

// ── OpenRouter credit ───────────────────────────────────────────────────────

let orCache: { at: number; value: OpenRouterCredit } | null = null;
const OR_TTL = 5 * 60_000;

async function openRouterCredit(): Promise<OpenRouterCredit> {
  if (orCache && Date.now() - orCache.at < OR_TTL) return orCache.value;
  const key = resolveSecret("openrouter");
  if (!key) {
    return {
      state: "setup-needed",
      detail: "Add OPENROUTER_API_KEY (env or Credentials page) to see live credit.",
    };
  }
  let value: OpenRouterCredit;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key.value}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) {
      value = { state: "error", detail: `key endpoint answered ${res.status}` };
    } else {
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const d = json.data ?? {};
      const usage = typeof d.usage === "number" ? d.usage : undefined;
      const limit = typeof d.limit === "number" ? d.limit : null;
      value = {
        state: "ok",
        detail: "live from openrouter.ai/api/v1/key",
        label: typeof d.label === "string" ? d.label : null,
        usageUsd: usage,
        limitUsd: limit,
        remainingUsd: limit !== null && usage !== undefined ? Math.max(0, limit - usage) : null,
      };
    }
  } catch {
    value = { state: "error", detail: "could not reach openrouter.ai" };
  }
  orCache = { at: Date.now(), value };
  return value;
}

// ── the pulse ───────────────────────────────────────────────────────────────

export async function buildPulse(): Promise<Pulse> {
  const cfg = loadConfig();
  const [sessions, openrouter] = await Promise.all([listSessions(80), openRouterCredit()]);
  const a2a = readTransactions(500);
  const a2a7d = a2a.filter((t) => Date.now() - Date.parse(t.startedAt || "") <= 7 * 86_400_000);

  const flatMonthlyUsd = cfg.subscriptions.reduce((a, s) => a + (s.monthlyPriceUsd || 0), 0);

  const mkWindow = (label: SpendWindow["label"], days: number): SpendWindow => {
    const ms = days * 86_400_000;
    const subscriptionsUsd = (flatMonthlyUsd / 30) * days;
    const tokenCostUsd = sessionCostInWindow(sessions, ms);
    const a2aCostUsd = a2a
      .filter((t) => Date.now() - Date.parse(t.startedAt || "") <= ms)
      .reduce((a, t) => a + (t.costUsd || 0), 0);
    return {
      label,
      days,
      subscriptionsUsd: Number(subscriptionsUsd.toFixed(2)),
      tokenCostUsd: Number(tokenCostUsd.toFixed(2)),
      a2aCostUsd: Number(a2aCostUsd.toFixed(2)),
      totalUsd: Number((subscriptionsUsd + tokenCostUsd).toFixed(2)),
    };
  };

  return {
    operator: await operatorScore(sessions, a2a7d.length),
    subscriptions: cfg.subscriptions,
    flatMonthlyUsd,
    spendWindows: [mkWindow("Today", 1), mkWindow("7 days", 7), mkWindow("28 days", 28)],
    apiEquivalentUsd28: Number(sessionCostInWindow(sessions, 28 * 86_400_000).toFixed(2)),
    usageWindows: [
      windowStats(sessions, "5h window", 5 * 3_600_000),
      windowStats(sessions, "24 hours", 86_400_000),
      windowStats(sessions, "7 days", 7 * 86_400_000),
      windowStats(sessions, "28 days", 28 * 86_400_000),
    ],
    openrouter,
    generatedAt: Date.now(),
  };
}
