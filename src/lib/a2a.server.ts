/**
 * Server half of the A2A surface.
 *
 * Two data paths, deliberately different:
 *  - live protocol traffic (card probe, sends, task lookups) goes over HTTP to
 *    the local A2A server;
 *  - the task feed and telemetry read the transaction ledger straight from
 *    disk (~/.baseline-workforce/a2a/transactions) — local-first, works even
 *    while the server is down, and the A2A spec has no task-list method anyway.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, WORKFORCE_HOME } from "./config";
import type { A2AStatus, A2ATaskRecord, A2ATelemetry, AgentCardSummary } from "./a2a";

export function a2aHome(): string {
  return process.env.BASELINE_A2A_HOME ?? path.join(WORKFORCE_HOME, "a2a");
}

function cardUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`;
}

function summariseCard(raw: Record<string, unknown>, baseUrl: string): AgentCardSummary {
  const skills = Array.isArray(raw.skills) ? (raw.skills as Record<string, unknown>[]) : [];
  const caps = (raw.capabilities ?? {}) as Record<string, unknown>;
  return {
    name: String(raw.name ?? "A2A server"),
    description: String(raw.description ?? ""),
    version: String(raw.version ?? ""),
    url: baseUrl,
    streaming: Boolean(caps.streaming),
    skills: skills.map((s) => ({
      id: String(s.id ?? ""),
      name: String(s.name ?? ""),
      description: String(s.description ?? ""),
      tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
    })),
  };
}

export async function probeA2A(): Promise<A2AStatus> {
  const baseUrl = loadConfig().a2aBaseUrl;
  try {
    const res = await fetch(cardUrl(baseUrl), { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) {
      return { up: false, baseUrl, detail: `agent card returned ${res.status}`, card: null };
    }
    const card = summariseCard((await res.json()) as Record<string, unknown>, baseUrl);
    return { up: true, baseUrl, detail: `${card.skills.length} skill${card.skills.length === 1 ? "" : "s"} on the card`, card };
  } catch {
    return { up: false, baseUrl, detail: `nothing answering at ${baseUrl}`, card: null };
  }
}

export async function fetchRawCard(): Promise<Record<string, unknown> | null> {
  const baseUrl = loadConfig().a2aBaseUrl;
  try {
    const res = await fetch(cardUrl(baseUrl), { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Newest-first transaction records from the on-disk ledger. */
export function readTransactions(limit = 200): A2ATaskRecord[] {
  const dir = path.join(a2aHome(), "transactions");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse()
    .slice(0, 3); // three most recent months is plenty for a feed
  const records: A2ATaskRecord[] = [];
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as A2ATaskRecord);
      } catch {
        /* one bad line must not hide the ledger */
      }
    }
  }
  records.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  return records.slice(0, limit);
}

export function telemetry(records: A2ATaskRecord[]): A2ATelemetry {
  const byDay = new Map<string, { tasks: number; costUsd: number }>();
  const bySkill = new Map<string, { tasks: number; costUsd: number }>();
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  for (const r of records) {
    if (r.state === "completed") completed++;
    else if (r.state === "failed") failed++;
    else if (r.state === "canceled") canceled++;
    inputTokens += r.inputTokens || 0;
    outputTokens += r.outputTokens || 0;
    costUsd += r.costUsd || 0;
    const day = (r.startedAt || "").slice(0, 10) || "unknown";
    const d = byDay.get(day) ?? { tasks: 0, costUsd: 0 };
    d.tasks++;
    d.costUsd += r.costUsd || 0;
    byDay.set(day, d);
    const s = bySkill.get(r.skill || "unknown") ?? { tasks: 0, costUsd: 0 };
    s.tasks++;
    s.costUsd += r.costUsd || 0;
    bySkill.set(r.skill || "unknown", s);
  }
  return {
    totalTasks: records.length,
    completed,
    failed,
    canceled,
    inputTokens,
    outputTokens,
    costUsd,
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14),
    bySkill: [...bySkill.entries()].map(([skill, v]) => ({ skill, ...v })).sort((a, b) => b.tasks - a.tasks),
  };
}

type Emit = (obj: Record<string, unknown>) => void;

/**
 * `message/stream` against the local server, re-emitted as the app's NDJSON
 * chat protocol so the /a2a Send tab renders exactly like every other chat.
 */
export async function sendMessageStream(skill: string, prompt: string, emit: Emit): Promise<void> {
  const baseUrl = loadConfig().a2aBaseUrl.replace(/\/$/, "");
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "message/stream",
    params: {
      message: {
        messageId: `wf-${Date.now().toString(36)}`,
        role: "user",
        parts: [{ kind: "text", text: prompt }],
        ...(skill ? { metadata: { skill } } : {}),
      },
    },
  };

  const res = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`A2A server answered ${res.status} — is it running at ${baseUrl}?`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let streamedChars = 0;
  let sawTerminal = false;

  const handleEvent = (payload: Record<string, unknown>) => {
    const result = (payload.result ?? payload) as Record<string, unknown>;
    const err = payload.error as Record<string, unknown> | undefined;
    if (err) {
      emit({ t: "err", text: String(err.message ?? "A2A error") });
      sawTerminal = true;
      return;
    }
    const kind = String(result.kind ?? "");
    if (kind === "status-update" || result.status) {
      const status = (result.status ?? {}) as Record<string, unknown>;
      const state = String(status.state ?? "");
      const message = status.message as Record<string, unknown> | undefined;
      const parts = Array.isArray(message?.parts) ? (message?.parts as Record<string, unknown>[]) : [];
      for (const p of parts) {
        const text = typeof p.text === "string" ? p.text : "";
        if (!text) continue;
        if (text.startsWith("[tool] ")) {
          const rest = text.slice(7);
          const [name, ...detail] = rest.split(" ");
          emit({ t: "tool", name, detail: detail.join(" ") });
        } else {
          streamedChars += text.length;
          emit({ t: "delta", text });
        }
      }
      if (["completed", "failed", "canceled", "rejected"].includes(state)) sawTerminal = true;
      if (state === "failed") emit({ t: "err", text: "task failed" });
      return;
    }
    if (kind === "artifact-update" || result.artifact) {
      const artifact = (result.artifact ?? {}) as Record<string, unknown>;
      const parts = Array.isArray(artifact.parts) ? (artifact.parts as Record<string, unknown>[]) : [];
      const text = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
      // The artifact repeats the full reply; only surface it when nothing streamed.
      if (text && streamedChars === 0) emit({ t: "final", text });
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        handleEvent(JSON.parse(data) as Record<string, unknown>);
      } catch {
        /* keep the stream alive across any odd frame */
      }
    }
  }
  if (!sawTerminal) emit({ t: "err", text: "stream ended without a terminal task state" });
}
