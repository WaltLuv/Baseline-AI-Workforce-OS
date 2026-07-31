/**
 * The Daily Dream Review — audit the last 24h of AI activity, prescribe the
 * top 4 highest-impact improvements.
 *
 * Ported from the Baseline Agent OS dream skill with one structural change:
 * the model returns JSON to THIS app, and the app writes
 * ~/.baseline-workforce/dreams/dream-YYYY-MM-DD.json itself — the CLI never
 * needs file access, and the write-home invariant holds. Guard rails carried
 * over verbatim: no confabulated prescriptions, evidence must reference real
 * data, invalid JSON is discarded rather than rendered.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AGENT_BY_ID } from "./agents";
import { chatStream } from "./chatStream";
import { listSessions, listSkills, rollup } from "./claudeData";
import { loadConfig, WORKFORCE_HOME } from "./config";
import { readTransactions } from "./a2a.server";
import { readGoals } from "./vaultWriter";
import { listNotes } from "./memory";

export const DREAMS_DIR = path.join(WORKFORCE_HOME, "dreams");

export type DreamCat = "MEMORY" | "COST" | "SKILLS" | "WORKFLOW";
export type DreamTone = "pink" | "orange" | "blue" | "yellow";

export interface Prescription {
  id: string;
  cat: DreamCat;
  tone: DreamTone;
  headline: string;
  prescription: string;
  evidence: string[];
  command: string;
  dollarImpact: number | null;
  timeImpactMins: number | null;
}

export interface Dream {
  date: string;
  model: string;
  generatedAt: string;
  prescriptions: Prescription[];
}

const CAT_TONE: Record<DreamCat, DreamTone> = {
  MEMORY: "pink",
  COST: "orange",
  SKILLS: "blue",
  WORKFLOW: "yellow",
};

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function listDreams(): { date: string; file: string }[] {
  if (!existsSync(DREAMS_DIR)) return [];
  return readdirSync(DREAMS_DIR)
    .filter((f) => /^dream-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => ({ date: f.slice(6, 16), file: path.join(DREAMS_DIR, f) }));
}

export function readDream(date: string): Dream | null {
  const file = path.join(DREAMS_DIR, `dream-${date}.json`);
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Dream;
    if (!Array.isArray(parsed.prescriptions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function latestDream(): Dream | null {
  const first = listDreams()[0];
  return first ? readDream(first.date) : null;
}

// ── context the model audits ────────────────────────────────────────────────

async function buildContext(): Promise<string> {
  const cfg = loadConfig();
  const sessions = await listSessions(60);
  const usage = rollup(sessions);
  const skills = await listSkills().catch(() => []);
  const goals = await readGoals().catch(() => []);
  const notes = await listNotes().catch(() => []);
  const a2a = readTransactions(100);
  const dayAgo = Date.now() - 86_400_000;
  const staleNotes = notes.filter((n) => Date.now() - n.mtime > 45 * 86_400_000).slice(0, 10);

  return JSON.stringify(
    {
      hourlyRateUsd: cfg.hourlyRateUsd,
      subscriptionsFlatMonthlyUsd: cfg.subscriptions.reduce((a, s) => a + s.monthlyPriceUsd, 0),
      subscriptions: cfg.subscriptions.map((s) => s.name),
      sessionsLast24h: sessions.filter((s) => s.updatedAt > dayAgo).length,
      usage: {
        totalSessions: usage.totalSessions,
        totalMessages: usage.totalMessages,
        totalToolCalls: usage.totalToolCalls,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        byDay: usage.byDay,
        models: usage.models,
        topProjects: usage.projects.slice(0, 5),
      },
      recentSessions: sessions.slice(0, 12).map((s) => ({
        project: s.project,
        firstPrompt: s.firstPrompt.slice(0, 140),
        messages: s.messages,
        toolCalls: s.toolCalls,
        tokens: s.inputTokens + s.outputTokens,
        ageHours: Math.round((Date.now() - s.updatedAt) / 3_600_000),
      })),
      skills: skills.map((sk) => ({ name: sk.name, source: sk.source, ageDays: Math.round((Date.now() - sk.updatedAt) / 86_400_000) })),
      goals: { open: goals.filter((g) => !g.done).length, done: goals.filter((g) => g.done).length },
      notes: { total: notes.length, staleExamples: staleNotes.map((n) => ({ path: n.path, ageDays: Math.round((Date.now() - n.mtime) / 86_400_000) })) },
      a2a: { tasks: a2a.length, failed: a2a.filter((t) => t.state === "failed").length, costUsd: a2a.reduce((x, t) => x + t.costUsd, 0) },
    },
    null,
    1,
  );
}

function dreamPrompt(context: string): string {
  return `You are the Dream Engine for Baseline AI Workforce OS. Audit the operator's recent AI activity below and prescribe the TOP 4 highest-impact improvements.

Rules (non-negotiable):
- Use ONLY the data below. If a signal bucket has insufficient data, do NOT invent a prescription for it — fewer than 4 is better than confabulation.
- Every evidence entry must reference real data from the context (project names, counts, token numbers, ages).
- cat must be one of MEMORY | COST | SKILLS | WORKFLOW, tone must match (MEMORY=pink, COST=orange, SKILLS=blue, WORKFLOW=yellow).
- Prefer 4 different categories when the data supports it.
- If the operator is on flat-rate subscriptions with headroom, frame cost findings as protecting headroom (dollarImpact null), not fake savings.
- ids are stable slugs (e.g. "memory-vault-not-configured"), no dates inside.
- command is one safe copy-pasteable shell command.

Reply with ONLY a JSON object, no markdown fences, exactly this shape:
{"prescriptions":[{"id":"...","cat":"MEMORY","tone":"pink","headline":"≤120 chars","prescription":"3-5 sentences","evidence":["...","...","..."],"command":"...","dollarImpact":null,"timeImpactMins":null}]}

CONTEXT:
${context}`;
}

// ── run ─────────────────────────────────────────────────────────────────────

function extractJson(text: string): { prescriptions?: unknown } | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  // Walk to the matching close brace of the first object.
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as { prescriptions?: unknown };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validate(raw: unknown): Prescription[] {
  if (!Array.isArray(raw)) return [];
  const out: Prescription[] = [];
  for (const p of raw as Record<string, unknown>[]) {
    const cat = String(p.cat ?? "") as DreamCat;
    if (!(cat in CAT_TONE)) continue;
    if (typeof p.headline !== "string" || typeof p.prescription !== "string") continue;
    out.push({
      id: String(p.id ?? `rx-${out.length}`),
      cat,
      tone: CAT_TONE[cat],
      headline: p.headline.slice(0, 160),
      prescription: p.prescription,
      evidence: Array.isArray(p.evidence) ? p.evidence.map(String).slice(0, 3) : [],
      command: typeof p.command === "string" ? p.command : "",
      dollarImpact: typeof p.dollarImpact === "number" ? p.dollarImpact : null,
      timeImpactMins: typeof p.timeImpactMins === "number" ? p.timeImpactMins : null,
    });
    if (out.length === 4) break;
  }
  return out;
}

type Emit = (obj: Record<string, unknown>) => void;

/** Run a dream review now, streaming progress; writes the dated file on success. */
export async function runDream(emit: Emit): Promise<Dream | null> {
  const spec = AGENT_BY_ID.claude;
  const cfg = loadConfig();
  emit({ t: "tool", name: "context", detail: "gathering sessions, skills, goals, notes, A2A ledger" });
  const context = await buildContext();
  const prompt = dreamPrompt(context);

  let full = "";
  const stream = chatStream({
    spec,
    prompt,
    history: [],
    streamId: `dream_${Date.now().toString(36)}`,
    permissionMode: "plan", // the model only writes JSON to stdout; the app does the file IO
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as Record<string, unknown>;
        if (evt.t === "delta" || evt.t === "final") full += String(evt.text ?? "");
        if (evt.t === "err" || evt.t === "usage" || evt.t === "tool") emit(evt);
      } catch {
        /* ignore */
      }
    }
  }

  const parsed = extractJson(full);
  const prescriptions = validate(parsed?.prescriptions);
  if (!prescriptions.length) {
    emit({ t: "err", text: "The model did not return valid prescriptions JSON — nothing was written." });
    return null;
  }
  const dream: Dream = {
    date: todayStamp(),
    model: cfg.claudeModel,
    generatedAt: new Date().toISOString(),
    prescriptions,
  };
  mkdirSync(DREAMS_DIR, { recursive: true });
  writeFileSync(path.join(DREAMS_DIR, `dream-${dream.date}.json`), JSON.stringify(dream, null, 2));
  emit({ t: "tool", name: "write", detail: `dreams/dream-${dream.date}.json · ${prescriptions.length} prescriptions` });
  return dream;
}

// ── schedule (generate, never install) ──────────────────────────────────────

export interface ScheduleArtifacts {
  platform: string;
  files: { path: string; description: string }[];
  installCommand: string;
  note: string;
}

/**
 * Writes the launchd plist (macOS) or a crontab line into the app home and
 * returns the exact one-line install command for the USER to run. The app
 * never touches ~/Library/LaunchAgents or the crontab itself.
 */
export function writeScheduleArtifacts(): ScheduleArtifacts {
  const dir = path.join(WORKFORCE_HOME, "automations");
  mkdirSync(dir, { recursive: true });
  const runCmd = `curl -fsS -X POST http://127.0.0.1:4400/api/dream -H 'Content-Type: application/json' -d '{"action":"run"}'`;
  const note =
    "The 7am run calls this app's own API, so the dashboard must be running (npm run start). Nothing is installed for you — run the install command yourself, once.";

  if (process.platform === "darwin") {
    const plistPath = path.join(dir, "com.baseline-workforce.dream.plist");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.baseline-workforce.dream</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>${runCmd.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${path.join(dir, "dream-cron.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(dir, "dream-cron.log")}</string>
</dict></plist>
`;
    writeFileSync(plistPath, plist);
    return {
      platform: "darwin",
      files: [{ path: plistPath, description: "launchd job — daily at 07:00" }],
      installCommand: `cp "${plistPath}" ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.baseline-workforce.dream.plist`,
      note,
    };
  }

  const cronPath = path.join(dir, "dream.crontab");
  const line = `0 7 * * * ${runCmd} >> ${path.join(dir, "dream-cron.log")} 2>&1`;
  writeFileSync(cronPath, `${line}\n`);
  return {
    platform: process.platform,
    files: [{ path: cronPath, description: "crontab line — daily at 07:00" }],
    installCommand: `(crontab -l 2>/dev/null; cat "${cronPath}") | crontab -`,
    note,
  };
}
