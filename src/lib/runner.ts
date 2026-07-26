/**
 * Process bridge. Everything that talks to a CLI agent goes through here so the
 * argument sanitising, PATH hardening and timeout behaviour live in one place.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HOME } from "./config";

const MAX_ARG_LEN = 128_000;

/**
 * A Next dev server can inherit a minimal PATH (no ~/.local/bin, no Homebrew),
 * which makes an agent crash halfway through a task when it shells out. Rebuild
 * a PATH that covers the usual install locations on macOS and Linux.
 */
export function agentEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const wanted = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    `${HOME}/.local/bin`,
    `${HOME}/.bun/bin`,
    `${HOME}/.cargo/bin`,
    `${HOME}/.npm-global/bin`,
    `${HOME}/.kimi-code/bin`,
    `${HOME}/.grok/bin`,
  ];
  const existing = (process.env.PATH ?? "").split(":").filter(Boolean);
  return {
    ...process.env,
    PATH: [...new Set([...existing, ...wanted])].join(":"),
    SHELL: process.env.SHELL || "/bin/sh",
    HOME,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    ...extra,
  };
}

function clean(args: readonly string[]): string[] {
  return args.filter(
    (a): a is string => typeof a === "string" && a.length > 0 && a.length <= MAX_ARG_LEN && !a.includes("\0"),
  );
}

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** Run a binary to completion and collect its output. */
export function run(
  bin: string,
  args: readonly string[],
  opts: { timeoutMs?: number; cwd?: string; input?: string; extraEnv?: Record<string, string> } = {},
): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(bin, clean(args), {
        cwd: opts.cwd ?? HOME,
        env: agentEnv(opts.extraEnv),
      }) as ChildProcessWithoutNullStreams;
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: "", stderr: String(e), durationMs: 0 });
      return;
    }
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, opts.timeoutMs ?? 20_000);

    child.stdout?.on("data", (b: Buffer) => { stdout += b.toString(); });
    child.stderr?.on("data", (b: Buffer) => { stderr += b.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, durationMs: Date.now() - started });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: String(e), durationMs: Date.now() - started });
    });
    if (opts.input) { try { child.stdin.write(opts.input); } catch { /* ignore */ } }
    try { child.stdin.end(); } catch { /* ignore */ }
  });
}

/** Spawn a long-running agent process and stream its output. */
export function spawnStream(
  bin: string,
  args: readonly string[],
  opts: { cwd?: string; input?: string; extraEnv?: Record<string, string> } = {},
): ChildProcessWithoutNullStreams {
  const child = spawn(bin, clean(args), {
    cwd: opts.cwd ?? HOME,
    env: agentEnv(opts.extraEnv),
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
  if (typeof opts.input === "string" && opts.input.length > 0) {
    try { child.stdin.write(opts.input); } catch { /* ignore */ }
  }
  try { child.stdin.end(); } catch { /* ignore */ }
  return child;
}

/** Live processes, keyed by stream id, so the Stop button can reach them. */
const live = new Map<string, ChildProcessWithoutNullStreams>();
const stopped = new Set<string>();

export function registerProc(id: string, child: ChildProcessWithoutNullStreams) {
  live.set(id, child);
  stopped.delete(id);
}
export function unregisterProc(id: string) {
  live.delete(id);
}
export function stopProc(id: string): boolean {
  const child = live.get(id);
  if (!child) return false;
  stopped.add(id);
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
  setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 3000);
  return true;
}
export function wasStopped(id: string): boolean {
  return stopped.has(id);
}
