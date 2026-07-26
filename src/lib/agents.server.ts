/**
 * Server-side half of the roster: is this agent actually installed, and what
 * exact command do we run to talk to it?
 *
 * Every default command below is visible in the UI and overridable from
 * Settings (`argv` in ~/.baseline-workforce/config.json), so when a CLI changes
 * its flags you fix it without touching source.
 */

import path from "node:path";
import { AGENT_BY_ID, type AgentId, type AgentSpec, type AgentStatus } from "./agents";
import { HOME, loadConfig, which, firstExisting } from "./config";
import { run } from "./runner";

export interface ResolvedCommand {
  bin: string;
  args: string[];
  /** Prompt written to the child's stdin instead of passed as an argument. */
  stdin?: string;
  extraEnv?: Record<string, string>;
  /** Human-readable form shown in the UI so a wrong flag is obvious. */
  display: string;
}

/** Default argument templates. `{prompt}` is replaced; `{model}` too where relevant. */
const ARGV_DEFAULTS: Record<AgentId, string[]> = {
  claude: ["-p", "--model", "{model}", "--output-format=stream-json", "--include-partial-messages", "--verbose"],
  freeclaude: ["-p", "--output-format=stream-json", "--include-partial-messages", "--verbose"],
  codex: ["exec", "--json", "--skip-git-repo-check", "{prompt}"],
  openclaw: ["run", "{prompt}"],
  hermes: ["chat", "--print", "{prompt}"],
  antigravity: ["-p", "{prompt}"],
  kimi: ["-p", "{prompt}"],
  grok: ["-p", "{prompt}"],
  opencode: ["run", "{prompt}"],
  ruflo: ["swarm", "{prompt}"],
  local: ["run", "{model}", "{prompt}"],
  glm: [],
  glmcode: [],
  omniroute: [],
  hy3: [],
  fusion: [],
  sakana: [],
};

/** Agents whose prompt goes over stdin (no OS argument-length ceiling). */
const STDIN_AGENTS = new Set<AgentId>(["claude", "freeclaude"]);

/** Locate an agent's binary. Returns null when it is not installed. */
export function resolveBin(spec: AgentSpec): string | null {
  const cfg = loadConfig();
  const override = cfg.bins?.[spec.id];
  if (override) return firstExisting(override) ?? override;

  const envKey = `WORKFORCE_${spec.id.toUpperCase()}_BIN`;
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;

  for (const bin of spec.bins) {
    const found = which(bin);
    if (found) return found;
  }
  for (const guess of spec.binGuesses ?? []) {
    const abs = path.isAbsolute(guess) ? guess : path.join(HOME, guess);
    const found = firstExisting(abs);
    if (found) return found;
  }
  return null;
}

function envKeyPresent(spec: AgentSpec): string | null {
  for (const key of spec.envKeys ?? []) {
    if (process.env[key]) return key;
  }
  return null;
}

/** Cheap, cached-per-request status for one agent. */
export async function agentStatus(spec: AgentSpec, opts: { probeVersion?: boolean } = {}): Promise<AgentStatus> {
  if (spec.id === "fusion") {
    // Fusion is a composition of the others; it is ready when anything else is.
    const others = await Promise.all(
      Object.values(AGENT_BY_ID)
        .filter((a) => a.id !== "fusion")
        .map((a) => quickReady(a)),
    );
    const n = others.filter(Boolean).length;
    return {
      id: spec.id,
      connected: n > 0,
      state: n > 0 ? "ready" : "setup-needed",
      bin: null,
      version: null,
      detail: n > 0 ? `${n} agent${n === 1 ? "" : "s"} available to fan out to` : "Connect at least one agent first",
    };
  }

  if (spec.backend === "http") {
    const key = envKeyPresent(spec);
    return {
      id: spec.id,
      connected: Boolean(key),
      state: key ? "ready" : "setup-needed",
      bin: null,
      version: null,
      detail: key ? `${key} is set` : `Set ${(spec.envKeys ?? []).join(" or ")} to connect`,
    };
  }

  const bin = resolveBin(spec);
  if (!bin) {
    return {
      id: spec.id,
      connected: false,
      state: "setup-needed",
      bin: null,
      version: null,
      detail: `\`${spec.bins[0] ?? spec.id}\` was not found on this machine`,
    };
  }

  let version: string | null = null;
  if (opts.probeVersion) {
    const res = await run(bin, ["--version"], { timeoutMs: 6000 });
    const out = `${res.stdout}${res.stderr}`.trim().split("\n")[0] ?? "";
    version = out.slice(0, 80) || null;
  }
  return {
    id: spec.id,
    connected: true,
    state: "ready",
    bin,
    version,
    detail: version ? `${bin} · ${version}` : bin,
  };
}

async function quickReady(spec: AgentSpec): Promise<boolean> {
  if (spec.backend === "http") return Boolean(envKeyPresent(spec));
  return Boolean(resolveBin(spec));
}

export async function allStatuses(probeVersion = false): Promise<AgentStatus[]> {
  return Promise.all(Object.values(AGENT_BY_ID).map((a) => agentStatus(a, { probeVersion })));
}

/**
 * Free Claude Code is the same binary with the local proxy injected, so the
 * request never reaches api.anthropic.com.
 */
function freeClaudeEnv(): Record<string, string> {
  const base = process.env.FCC_BASE_URL ?? "http://127.0.0.1:8082";
  return {
    ANTHROPIC_BASE_URL: base,
    ANTHROPIC_AUTH_TOKEN: process.env.FCC_AUTH_TOKEN ?? "fcc-local",
    ANTHROPIC_API_KEY: process.env.FCC_AUTH_TOKEN ?? "fcc-local",
  };
}

/** Permission modes we are willing to pass through to the Claude Code CLI. */
const ALLOWED_PERMISSION_MODES = new Set(["acceptEdits", "plan", "default"]);

/** Build the exact command for a chat turn. Throws when the agent isn't connected. */
export function buildCommand(
  spec: AgentSpec,
  prompt: string,
  opts: { model?: string; permissionMode?: string } = {},
): ResolvedCommand {
  const cfg = loadConfig();
  const bin = resolveBin(spec);
  if (!bin) throw new Error(`${spec.name} is not installed. ${spec.install}`);

  const template =
    (cfg as unknown as { argv?: Record<string, string[]> }).argv?.[spec.id] ?? ARGV_DEFAULTS[spec.id] ?? ["{prompt}"];
  const model = opts.model ?? (spec.id === "claude" ? cfg.claudeModel : spec.id === "local" ? "llama3.2" : "");

  const usesStdin = STDIN_AGENTS.has(spec.id);
  const args: string[] = [];
  for (const part of template) {
    if (part === "{prompt}") {
      if (!usesStdin) args.push(prompt);
      continue;
    }
    if (part === "{model}") {
      if (model) args.push(model);
      continue;
    }
    args.push(part.replace("{model}", model));
  }
  // A template that never mentions {prompt} still needs the prompt somewhere.
  if (!usesStdin && !template.includes("{prompt}")) args.push(prompt);

  // Without this, a Claude Code run started headlessly stops at the first file
  // write and the studio pages look like they silently did nothing. The agent
  // is confined to its own workspace project (the cwd we spawn it in); set
  // "permissionMode": "default" in the config file to require approval instead.
  const mode = opts.permissionMode ?? cfg.permissionMode ?? "acceptEdits";
  if ((spec.id === "claude" || spec.id === "freeclaude") && mode !== "default" && ALLOWED_PERMISSION_MODES.has(mode)) {
    args.unshift("--permission-mode", mode);
  }

  const shortPrompt = prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt;
  const display = [
    path.basename(bin),
    ...args.map((a) => (a === prompt ? JSON.stringify(shortPrompt) : a)),
    usesStdin ? "< prompt (stdin)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    bin,
    args,
    stdin: usesStdin ? prompt : undefined,
    extraEnv: spec.id === "freeclaude" ? freeClaudeEnv() : undefined,
    display,
  };
}
