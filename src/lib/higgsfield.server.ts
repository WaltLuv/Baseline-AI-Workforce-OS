/**
 * Higgsfield — the creative provider, Baseline Agent OS pattern: Claude Code
 * is the studio; Higgsfield plugs in as a provider through its MCP server
 * (https://mcp.higgsfield.ai/mcp, OAuth device flow) with optional platform
 * API keys.
 *
 * TRUTH-FIRST, carried over verbatim from the source app: capability the
 * stack doesn't expose is reported as credentials_missing / setup_required —
 * never faked.
 */

import { listMcpServers } from "./claudeData";
import { resolveSecret } from "./credentials.server";

export const HIGGSFIELD_MCP_URL = process.env.HIGGSFIELD_MCP_URL ?? "https://mcp.higgsfield.ai/mcp";
export const HIGGSFIELD_DASHBOARD_URL = "https://higgsfield.ai";

export type HiggsfieldState = "ready" | "credentials_missing" | "setup_required" | "error";

export interface HiggsfieldOverview {
  state: HiggsfieldState;
  detail: string;
  /** Platform API keys (key id + secret, or a single key). */
  credentialsPresent: boolean;
  credentialSource: string | null;
  /** The MCP server is registered with the local Claude Code CLI. */
  mcpRegistered: boolean;
  mcpCommand: string | null;
  /** The MCP endpoint answered over the network. */
  mcpReachable: boolean;
  mcpUrl: string;
  install: string;
}

let reachCache: { at: number; ok: boolean } | null = null;
const REACH_TTL = 5 * 60_000;

async function mcpReachable(): Promise<boolean> {
  if (reachCache && Date.now() - reachCache.at < REACH_TTL) return reachCache.ok;
  let ok = false;
  try {
    // Any HTTP answer (including 401/405 — it wants OAuth) proves the endpoint is alive.
    const res = await fetch(HIGGSFIELD_MCP_URL, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    ok = res.status > 0;
  } catch {
    try {
      const res = await fetch(HIGGSFIELD_MCP_URL, { method: "GET", signal: AbortSignal.timeout(4000) });
      ok = res.status > 0;
    } catch {
      ok = false;
    }
  }
  reachCache = { at: Date.now(), ok };
  return ok;
}

export async function higgsfieldOverview(): Promise<HiggsfieldOverview> {
  const cred = resolveSecret("higgsfield");
  const servers = await listMcpServers().catch(() => []);
  const mcp = servers.find((s) => /higgsfield/i.test(s.name) || /higgsfield/i.test(s.command));
  const reachable = await mcpReachable();

  const credentialsPresent = Boolean(cred);
  const mcpRegistered = Boolean(mcp);

  let state: HiggsfieldState;
  let detail: string;
  if (mcpRegistered && reachable) {
    state = "ready";
    detail = "MCP registered with Claude Code and the endpoint is answering";
  } else if (mcpRegistered && !reachable) {
    state = "error";
    detail = "MCP is registered but mcp.higgsfield.ai is not answering from here";
  } else if (!mcpRegistered && credentialsPresent) {
    state = "setup_required";
    detail = "API keys found, but the MCP server is not registered with Claude Code yet";
  } else {
    state = "credentials_missing";
    detail = "No Higgsfield MCP registration and no API keys found";
  }

  return {
    state,
    detail,
    credentialsPresent,
    credentialSource: cred?.source ?? null,
    mcpRegistered,
    mcpCommand: mcp?.command ?? null,
    mcpReachable: reachable,
    mcpUrl: HIGGSFIELD_MCP_URL,
    install: `claude mcp add --transport http higgsfield ${HIGGSFIELD_MCP_URL}`,
  };
}
