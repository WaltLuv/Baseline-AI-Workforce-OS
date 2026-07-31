/**
 * Single source of truth for paths, binaries and user settings.
 *
 * Resolution order (highest priority first):
 *   1. environment variables            — WORKFORCE_CLAUDE_BIN, WORKFORCE_VAULT, …
 *   2. ~/.baseline-workforce/config.json — written by the Settings page
 *   3. workforce.config.json in the app dir
 *   4. auto-detect on PATH + the usual install locations
 *
 * Nothing here phones home. Every value points at something on this machine.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

export const HOME = os.homedir();
/** Everything this app writes lives under here. Source data is never modified. */
export const WORKFORCE_HOME = process.env.WORKFORCE_HOME ?? path.join(HOME, ".baseline-workforce");
export const CONFIG_PATH = path.join(WORKFORCE_HOME, "config.json");

export interface WorkforceConfig {
  /** Display name for the human operator. */
  userName: string;
  /** Obsidian vault root — goals + journal are mirrored here as markdown. */
  vaultRoot: string | null;
  /** Folder inside the vault that receives everything this app writes. */
  vaultFolder: string;
  /** Where agent build output lands. */
  workspaceRoot: string;
  /** Model pinned for the Claude Code CLI bridge. */
  claudeModel: string;
  /**
   * How the Claude Code CLI handles file writes when run from here.
   * "acceptEdits" (default) lets an agent finish a build inside its own
   * workspace project; "default" makes it ask, which no headless run can answer.
   */
  permissionMode: "acceptEdits" | "plan" | "default";
  /** Explicit binary overrides, keyed by agent id. */
  bins: Record<string, string>;
  /** Categories offered in the Goals page dropdown. */
  goalCategories: string[];
  /** Label shown in the top bar. */
  locationLabel: string;
  /** Base URL of the local A2A server (apps/a2a-server). */
  a2aBaseUrl: string;
  /**
   * Your own AI subscriptions, for the spend ledger on the home page. Prices
   * cannot be auto-detected, so you enter them once; everything else on the
   * dashboard is computed. This is a personal ledger — nothing in this app is
   * ever gated on it.
   */
  subscriptions: SubscriptionEntry[];
  /** Hourly rate used wherever time saved is turned into dollars. */
  hourlyRateUsd: number;
  /**
   * CLI-Anything: your own CLIs as chat agents, defined in config rather than
   * source. Each one gets the full agent treatment — status probe, chat page,
   * history — via the same bridge as the built-in roster.
   */
  customAgents: CustomAgentEntry[];
}

export interface CustomAgentEntry {
  /** Lowercase slug, must not collide with a built-in agent id. */
  id: string;
  name: string;
  bin: string;
  /** Argument template; "{prompt}" is replaced (appended when absent). */
  argv?: string[];
  streamMode?: "ndjson" | "text";
  accent?: string;
  tagline?: string;
}

export interface SubscriptionEntry {
  id: string;
  name: string;
  /** e.g. "Anthropic · OAuth", "OpenAI · ChatGPT subscription". */
  provider?: string;
  monthlyPriceUsd: number;
  note?: string;
}

const DEFAULTS: WorkforceConfig = {
  userName: "Operator",
  vaultRoot: null,
  vaultFolder: "Baseline AI Workforce",
  workspaceRoot: path.join(WORKFORCE_HOME, "workspace"),
  claudeModel: "claude-opus-4-8",
  permissionMode: "acceptEdits",
  bins: {},
  goalCategories: ["Business", "Build", "Health", "Learning", "Personal"],
  locationLabel: "Local",
  a2aBaseUrl: "http://127.0.0.1:8484",
  subscriptions: [],
  hourlyRateUsd: 120,
  customAgents: [],
};

function loadFile(): Partial<WorkforceConfig> {
  const candidates = [
    process.env.WORKFORCE_CONFIG,
    CONFIG_PATH,
    path.join(process.cwd(), "workforce.config.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8"));
      if (parsed && typeof parsed === "object") return parsed as Partial<WorkforceConfig>;
    } catch {
      /* malformed config should never take the dashboard down */
    }
  }
  return {};
}

/** Re-read on every access so the Settings page takes effect without a restart. */
export function loadConfig(): WorkforceConfig {
  const file = loadFile();
  const vaultFromEnv = process.env.WORKFORCE_VAULT?.trim();
  const vaultRoot =
    (vaultFromEnv && existsSync(vaultFromEnv) ? vaultFromEnv : null) ??
    (typeof file.vaultRoot === "string" && existsSync(file.vaultRoot) ? file.vaultRoot : null) ??
    detectVault();

  return {
    ...DEFAULTS,
    ...file,
    userName: process.env.WORKFORCE_USER_NAME ?? file.userName ?? DEFAULTS.userName,
    vaultRoot,
    vaultFolder: file.vaultFolder || DEFAULTS.vaultFolder,
    workspaceRoot: process.env.WORKFORCE_WORKSPACE ?? file.workspaceRoot ?? DEFAULTS.workspaceRoot,
    claudeModel: process.env.WORKFORCE_CLAUDE_MODEL ?? file.claudeModel ?? DEFAULTS.claudeModel,
    permissionMode: file.permissionMode ?? DEFAULTS.permissionMode,
    bins: { ...(file.bins ?? {}) },
    goalCategories: Array.isArray(file.goalCategories) && file.goalCategories.length
      ? file.goalCategories
      : DEFAULTS.goalCategories,
    locationLabel: process.env.WORKFORCE_LOCATION ?? file.locationLabel ?? DEFAULTS.locationLabel,
    a2aBaseUrl: process.env.WORKFORCE_A2A_URL ?? file.a2aBaseUrl ?? DEFAULTS.a2aBaseUrl,
    subscriptions: Array.isArray(file.subscriptions) ? file.subscriptions : DEFAULTS.subscriptions,
    hourlyRateUsd:
      typeof file.hourlyRateUsd === "number" && file.hourlyRateUsd > 0 ? file.hourlyRateUsd : DEFAULTS.hourlyRateUsd,
    customAgents: Array.isArray(file.customAgents)
      ? file.customAgents.filter((a) => a && typeof a.id === "string" && /^[a-z][a-z0-9-]{1,30}$/.test(a.id) && typeof a.bin === "string")
      : DEFAULTS.customAgents,
  };
}

function detectVault(): string | null {
  const guesses = [
    path.join(HOME, "Documents", "Obsidian Vault"),
    path.join(HOME, "Obsidian Vault"),
    path.join(HOME, "Obsidian"),
    path.join(HOME, "vault"),
  ];
  for (const g of guesses) if (existsSync(g)) return g;
  return null;
}

/** `which`, but tolerant of the stripped PATH a Next server can inherit. */
export function which(cmd: string): string | null {
  try {
    const out = execFileSync("/usr/bin/env", ["sh", "-c", `command -v ${cmd}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** First path that actually exists, or null. */
export function firstExisting(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    if (existsSync(c)) return c;
  }
  return null;
}

export const config = loadConfig();
