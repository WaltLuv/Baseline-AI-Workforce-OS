/**
 * A small MCP client (stdio transport).
 *
 * Used for the NotebookLM link, but nothing here is NotebookLM-specific: we
 * spawn the server, complete the handshake, and *discover* its tools with
 * `tools/list` rather than assuming names. That means the page keeps working
 * when the server adds or renames a tool.
 *
 * Protocol: JSON-RPC 2.0, one message per line, over the child's stdin/stdout.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { agentEnv } from "./runner";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private nextId = 1;
  private stderr = "";
  private ready = false;

  constructor(
    private bin: string,
    private args: string[] = [],
    private opts: { cwd?: string; timeoutMs?: number } = {},
  ) {}

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string; code?: number } };
    try {
      msg = JSON.parse(trimmed);
    } catch {
      // Servers that print a banner before speaking JSON-RPC are common.
      return;
    }
    if (typeof msg.id !== "number") return; // notification
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) pending.reject(new Error(msg.error.message ?? `MCP error ${msg.error.code ?? ""}`));
    else pending.resolve(msg.result);
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.child) throw new Error("MCP server is not running");
    const id = this.nextId++;
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${(this.opts.timeoutMs ?? 60_000) / 1000}s${this.stderr ? `. Server said: ${this.stderr.slice(-300)}` : ""}`));
      }, this.opts.timeoutMs ?? 60_000);

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child!.stdin.write(payload);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private notify(method: string, params: Record<string, unknown> = {}) {
    try {
      this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    } catch {
      /* server already gone */
    }
  }

  async start(): Promise<void> {
    if (this.ready) return;
    // spawnStream closes stdin after writing; MCP needs it open for the whole
    // session, so the child is spawned here with the same hardened env.
    this.child = spawn(this.bin, this.args, {
      cwd: this.opts.cwd,
      env: agentEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.child.stdout.on("data", (b: Buffer) => {
      this.buffer += b.toString();
      let idx: number;
      while ((idx = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        this.handleLine(line);
      }
    });
    this.child.stderr.on("data", (b: Buffer) => {
      this.stderr = `${this.stderr}${b.toString()}`.slice(-4000);
    });
    this.child.on("close", () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server exited${this.stderr ? `: ${this.stderr.slice(-300)}` : ""}`));
      }
      this.pending.clear();
      this.ready = false;
      this.child = null;
    });

    await this.send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "baseline-ai-workforce", version: "1.0.0" },
    });
    this.notify("notifications/initialized");
    this.ready = true;
  }

  async listTools(): Promise<McpTool[]> {
    await this.start();
    const result = (await this.send("tools/list")) as {
      tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[];
    };
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? {},
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    await this.start();
    const result = (await this.send("tools/call", { name, arguments: args })) as {
      content?: { type?: string; text?: string }[];
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type ?? "content"}]`))
      .join("\n")
      .trim();
    return { text, isError: Boolean(result.isError) };
  }

  stop() {
    try { this.child?.kill("SIGTERM"); } catch { /* already gone */ }
    this.child = null;
    this.ready = false;
  }

  get lastStderr(): string {
    return this.stderr;
  }
}

/**
 * One live server per binary, reused across requests — starting a NotebookLM
 * session costs seconds, and doing it per keystroke would be painful.
 */
const pool = new Map<string, McpClient>();

export async function mcpClient(bin: string, args: string[] = []): Promise<McpClient> {
  const key = [bin, ...args].join(" ");
  let client = pool.get(key);
  if (!client) {
    client = new McpClient(bin, args, { timeoutMs: 120_000 });
    pool.set(key, client);
  }
  await client.start();
  return client;
}

export function dropMcpClient(bin: string, args: string[] = []) {
  const key = [bin, ...args].join(" ");
  pool.get(key)?.stop();
  pool.delete(key);
}
