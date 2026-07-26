/**
 * One chat protocol for every agent.
 *
 * Whatever the underlying CLI emits — Claude's stream-json, Codex's event JSON,
 * or plain text — it is normalised into the small NDJSON protocol below and
 * streamed to the browser. The client only has to understand one shape.
 *
 *   {"t":"meta","streamId":"…","command":"claude -p …"}
 *   {"t":"delta","text":"partial assistant text"}
 *   {"t":"think","text":"reasoning, when the CLI exposes it"}
 *   {"t":"tool","name":"Edit","detail":"src/app/page.tsx"}
 *   {"t":"usage","input":123,"output":456,"costUsd":0.01}
 *   {"t":"err","text":"stderr line"}
 *   {"t":"end","code":0,"ok":true}
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentSpec } from "./agents";
import { buildCommand } from "./agents.server";
import { spawnStream, registerProc, unregisterProc, wasStopped } from "./runner";
import { httpAgentStream } from "./httpAgents";

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

export function makeStreamId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * CLIs invoked with a print flag start a fresh session per call, so prior turns
 * are packed into the prompt. That is what gives every agent page real memory.
 */
export function withHistory(history: ChatMsg[], current: string, maxChars = 12_000): string {
  if (!Array.isArray(history) || history.length === 0) return current;
  const lines: string[] = [
    "Below is our conversation so far. Read it, then reply to the final message.",
    "",
    "--- conversation ---",
  ];
  let budget = maxChars;
  const recent: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!m || typeof m.text !== "string" || !m.text.trim()) continue;
    const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`;
    if (line.length > budget) {
      recent.unshift("…[earlier turns trimmed]");
      break;
    }
    budget -= line.length;
    recent.unshift(line);
  }
  lines.push(...recent, "--- end conversation ---", "", `User: ${current}`, "Assistant:");
  return lines.join("\n");
}

type Emit = (obj: Record<string, unknown>) => void;

/** Pull the useful bits out of one Claude Code stream-json line. */
function handleClaudeEvent(evt: Record<string, unknown>, emit: Emit) {
  const type = evt.type;

  if (type === "stream_event") {
    const inner = evt.event as Record<string, unknown> | undefined;
    const delta = inner?.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      emit({ t: "delta", text: delta.text });
      return;
    }
    if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
      emit({ t: "think", text: delta.thinking });
      return;
    }
    return;
  }

  if (type === "assistant") {
    const message = evt.message as { content?: unknown[] } | undefined;
    for (const block of message?.content ?? []) {
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" && typeof b.name === "string") {
        const input = b.input as Record<string, unknown> | undefined;
        const detail =
          (typeof input?.file_path === "string" && input.file_path) ||
          (typeof input?.command === "string" && String(input.command).slice(0, 120)) ||
          (typeof input?.pattern === "string" && input.pattern) ||
          (typeof input?.description === "string" && input.description) ||
          "";
        emit({ t: "tool", name: b.name, detail });
      }
    }
    return;
  }

  if (type === "result") {
    const usage = evt.usage as Record<string, unknown> | undefined;
    emit({
      t: "usage",
      input: Number(usage?.input_tokens ?? 0) + Number(usage?.cache_read_input_tokens ?? 0),
      output: Number(usage?.output_tokens ?? 0),
      costUsd: Number(evt.total_cost_usd ?? 0),
      sessionId: typeof evt.session_id === "string" ? evt.session_id : undefined,
    });
    // In non-partial mode the final text only arrives here.
    if (typeof evt.result === "string" && evt.result && evt.subtype === "success") {
      emit({ t: "final", text: evt.result });
    }
  }
}

/** Codex `exec --json` shapes have moved around between releases; stay tolerant. */
function handleCodexEvent(evt: Record<string, unknown>, emit: Emit) {
  const msg = (evt.msg ?? evt.item ?? evt) as Record<string, unknown>;
  const type = String(msg.type ?? evt.type ?? "");

  if (type.includes("delta") && typeof msg.delta === "string") {
    emit({ t: "delta", text: msg.delta });
    return;
  }
  if (type.includes("reasoning") && typeof msg.text === "string") {
    emit({ t: "think", text: msg.text });
    return;
  }
  if (type.includes("command") || type.includes("exec")) {
    const cmd = msg.command ?? msg.cmd;
    emit({ t: "tool", name: "shell", detail: Array.isArray(cmd) ? cmd.join(" ") : String(cmd ?? "") });
    return;
  }
  const text = msg.message ?? msg.text ?? msg.content;
  if (typeof text === "string" && text.trim()) emit({ t: "final", text });
  const usage = (msg.usage ?? evt.usage) as Record<string, unknown> | undefined;
  if (usage) {
    emit({
      t: "usage",
      input: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
      output: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
      costUsd: 0,
    });
  }
}

export interface ChatRequest {
  spec: AgentSpec;
  prompt: string;
  history: ChatMsg[];
  cwd?: string;
  model?: string;
  streamId: string;
  /** Overrides the configured Claude Code permission mode for this turn. */
  permissionMode?: string;
}

/** Build the NDJSON response body for one chat turn. */
export function chatStream(req: ChatRequest): ReadableStream<Uint8Array> {
  const { spec, streamId } = req;
  const encoder = new TextEncoder();
  // Held outside start() so cancel() can reach the process it spawned.
  let spawned: ChildProcessWithoutNullStreams | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (obj) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      // ── HTTP-backed agents ────────────────────────────────────────────────
      if (spec.backend === "http") {
        emit({ t: "meta", streamId, command: `${spec.name} · HTTP` });
        try {
          await httpAgentStream(spec, req.prompt, req.history, req.model, emit);
          emit({ t: "end", code: 0, ok: true });
        } catch (e) {
          emit({ t: "err", text: e instanceof Error ? e.message : String(e) });
          emit({ t: "end", code: 1, ok: false });
        }
        close();
        return;
      }

      // ── CLI-backed agents ────────────────────────────────────────────────
      const packed = spec.carriesHistory ? withHistory(req.history, req.prompt) : req.prompt;
      let cmd;
      try {
        cmd = buildCommand(spec, packed, { model: req.model, permissionMode: req.permissionMode });
      } catch (e) {
        emit({ t: "err", text: e instanceof Error ? e.message : String(e) });
        emit({ t: "end", code: 1, ok: false });
        close();
        return;
      }

      emit({ t: "meta", streamId, command: cmd.display });

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawnStream(cmd.bin, cmd.args, {
          cwd: req.cwd,
          input: cmd.stdin,
          extraEnv: cmd.extraEnv,
        });
      } catch (e) {
        emit({ t: "err", text: e instanceof Error ? e.message : String(e) });
        emit({ t: "end", code: 1, ok: false });
        close();
        return;
      }
      spawned = child;
      registerProc(streamId, child);

      let buf = "";
      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (spec.streamMode === "text") {
          emit({ t: "delta", text: `${line}\n` });
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          // A CLI that prints a banner before its JSON should not break the chat.
          emit({ t: "delta", text: `${line}\n` });
          return;
        }
        if (spec.streamMode === "claude-stream-json") handleClaudeEvent(parsed, emit);
        else if (spec.streamMode === "codex-json") handleCodexEvent(parsed, emit);
        else {
          const text = parsed.text ?? parsed.message ?? parsed.content;
          if (typeof text === "string") emit({ t: "delta", text });
        }
      };

      child.stdout.on("data", (b: Buffer) => {
        buf += b.toString();
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          consumeLine(line);
        }
        // Plain-text agents should not wait for a newline to show progress.
        if (spec.streamMode === "text" && buf.length > 0) {
          emit({ t: "delta", text: buf });
          buf = "";
        }
      });

      child.stderr.on("data", (b: Buffer) => {
        const text = b.toString();
        if (text.trim()) emit({ t: "err", text });
      });

      child.on("error", (e) => {
        unregisterProc(streamId);
        emit({ t: "err", text: String(e) });
        emit({ t: "end", code: 1, ok: false });
        close();
      });

      child.on("close", (code) => {
        if (buf.trim()) consumeLine(buf);
        const stopped = wasStopped(streamId);
        unregisterProc(streamId);
        emit({ t: "end", code, ok: code === 0, stopped });
        close();
      });
    },

    cancel() {
      // Browser navigated away or aborted — kill the process rather than
      // leaving an agent running against a reader nobody is listening to.
      try { spawned?.kill("SIGTERM"); } catch { /* already gone */ }
      const child = spawned;
      if (child) setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 3000);
      unregisterProc(streamId);
    },
  });
}

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
} as const;
