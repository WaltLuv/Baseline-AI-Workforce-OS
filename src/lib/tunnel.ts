/**
 * Phone agent — reach this dashboard from your phone.
 *
 * The app binds to 127.0.0.1, so a phone on the same wifi cannot see it. Two
 * honest ways out, in order of preference:
 *
 *   1. LAN — no tunnel, no third party, works when the phone is on the same
 *      network. We just report the machine's LAN address.
 *   2. cloudflared / ngrok — a real public URL, which means the dashboard is
 *      reachable from the internet for as long as it runs. That is stated
 *      plainly in the UI before anything is started.
 */

import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import os from "node:os";
import QRCode from "qrcode";
import { which } from "./config";
import { spawn } from "node:child_process";
import { agentEnv } from "./runner";

const PORT = Number(process.env.PORT ?? 4400);

export function lanUrls(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      out.push(`http://${addr.address}:${PORT}`);
    }
  }
  return out;
}

export type TunnelProvider = "cloudflared" | "ngrok";

/** stdin is "ignore" — a tunnel has nothing to read from us. */
type TunnelProcess = ChildProcessByStdio<null, Readable, Readable>;

interface TunnelState {
  provider: TunnelProvider;
  child: TunnelProcess;
  url: string | null;
  log: string;
  startedAt: number;
}

let current: TunnelState | null = null;

export function tunnelBinaries(): { provider: TunnelProvider; bin: string | null }[] {
  return [
    { provider: "cloudflared", bin: which("cloudflared") },
    { provider: "ngrok", bin: which("ngrok") },
  ];
}

const URL_PATTERNS = [/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i, /https:\/\/[a-z0-9-]+\.ngrok(?:-free)?\.app/i];

function scanForUrl(text: string): string | null {
  for (const re of URL_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function tunnelStatus() {
  return {
    running: Boolean(current),
    provider: current?.provider ?? null,
    url: current?.url ?? null,
    startedAt: current?.startedAt ?? null,
    log: current?.log.slice(-1500) ?? "",
    available: tunnelBinaries(),
    lan: lanUrls(),
    port: PORT,
  };
}

export async function startTunnel(provider: TunnelProvider): Promise<{ url: string | null; log: string }> {
  if (current) throw new Error(`a ${current.provider} tunnel is already running`);
  const bin = which(provider);
  if (!bin) throw new Error(`${provider} is not installed`);

  const args =
    provider === "cloudflared"
      ? ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"]
      : ["http", String(PORT), "--log", "stdout"];

  const child = spawn(bin, args, { env: agentEnv(), stdio: ["ignore", "pipe", "pipe"] }) as TunnelProcess;
  const state: TunnelState = { provider, child, url: null, log: "", startedAt: Date.now() };
  current = state;

  const absorb = (b: Buffer) => {
    state.log = `${state.log}${b.toString()}`.slice(-8000);
    if (!state.url) state.url = scanForUrl(state.log);
  };
  child.stdout.on("data", absorb);
  child.stderr.on("data", absorb); // cloudflared prints its URL to stderr
  child.on("close", () => {
    if (current === state) current = null;
  });

  // Give it a moment to print the URL; the caller can poll if it is slow.
  const deadline = Date.now() + 15_000;
  while (!state.url && Date.now() < deadline && current === state) {
    await new Promise((r) => setTimeout(r, 400));
  }
  return { url: state.url, log: state.log.slice(-1500) };
}

export function stopTunnel(): boolean {
  if (!current) return false;
  try { current.child.kill("SIGTERM"); } catch { /* already gone */ }
  current = null;
  return true;
}

/** QR as a data URL, generated locally — no image service involved. */
export async function qrFor(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 320,
    margin: 1,
    color: { dark: "#f4efe6", light: "#0d0a12" },
  });
}
