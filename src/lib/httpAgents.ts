/**
 * HTTP-backed agents (GLM, OmniRoute/OpenRouter, Hy3, Sakana).
 *
 * All four speak the OpenAI chat-completions shape, so one streaming client
 * covers them. Keys come from the environment only — nothing is stored here and
 * nothing is sent anywhere except the endpoint you configured.
 */

import type { AgentSpec } from "./agents";
import type { ChatMsg } from "./chatStream";

interface Endpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

function pickKey(spec: AgentSpec): string | null {
  for (const k of spec.envKeys ?? []) {
    const v = process.env[k];
    if (v) return v;
  }
  return null;
}

export function resolveEndpoint(spec: AgentSpec, model?: string): Endpoint {
  const apiKey = pickKey(spec);
  if (!apiKey) {
    throw new Error(`${spec.name} needs ${(spec.envKeys ?? []).join(" or ")} in .env.local`);
  }
  switch (spec.id) {
    case "glm":
    case "glmcode":
      return {
        baseUrl: process.env.GLM_BASE_URL ?? "https://api.z.ai/api/paas/v4",
        apiKey,
        model: model || process.env.GLM_MODEL || "glm-4.6",
      };
    case "omniroute":
      return {
        baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        apiKey,
        model: model || process.env.OMNIROUTE_MODEL || "anthropic/claude-sonnet-4.5",
        extraHeaders: { "X-Title": "Baseline AI Workforce" },
      };
    case "hy3":
      return {
        baseUrl: process.env.HY3_BASE_URL ?? "https://api.hy3.ai/v1",
        apiKey,
        model: model || process.env.HY3_MODEL || "hy3-coder",
      };
    case "sakana":
      return {
        baseUrl: process.env.SAKANA_BASE_URL ?? "https://api.sakana.ai/v1",
        apiKey,
        model: model || process.env.SAKANA_MODEL || "sakana-default",
      };
    default:
      throw new Error(`${spec.name} has no HTTP endpoint configured`);
  }
}

type Emit = (obj: Record<string, unknown>) => void;

/** Stream a completion, emitting the same events the CLI bridge emits. */
export async function httpAgentStream(
  spec: AgentSpec,
  prompt: string,
  history: ChatMsg[],
  model: string | undefined,
  emit: Emit,
): Promise<void> {
  const ep = resolveEndpoint(spec, model);
  const messages = [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.text })),
    { role: "user" as const, content: prompt },
  ];

  const res = await fetch(`${ep.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ep.apiKey}`,
      ...(ep.extraHeaders ?? {}),
    },
    body: JSON.stringify({ model: ep.model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${spec.name} endpoint returned ${res.status}. ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: Record<string, unknown> | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          choices?: { delta?: { content?: string; reasoning_content?: string } }[];
          usage?: Record<string, unknown>;
        };
        const delta = evt.choices?.[0]?.delta;
        if (delta?.reasoning_content) emit({ t: "think", text: delta.reasoning_content });
        if (delta?.content) emit({ t: "delta", text: delta.content });
        if (evt.usage) usage = evt.usage;
      } catch {
        /* keep-alive comment or partial frame */
      }
    }
  }

  if (usage) {
    emit({
      t: "usage",
      input: Number(usage.prompt_tokens ?? 0),
      output: Number(usage.completion_tokens ?? 0),
      costUsd: 0,
    });
  }
}

/** Non-streaming variant, used by Fusion and the Room synthesiser. */
export async function httpAgentOnce(spec: AgentSpec, prompt: string, model?: string): Promise<string> {
  const ep = resolveEndpoint(spec, model);
  const res = await fetch(`${ep.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ep.apiKey}`,
      ...(ep.extraHeaders ?? {}),
    },
    body: JSON.stringify({ model: ep.model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`${spec.name} endpoint returned ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
