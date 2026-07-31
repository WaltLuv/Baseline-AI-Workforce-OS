/**
 * A2A (Agent2Agent protocol) — client-safe types.
 *
 * The local A2A server (apps/a2a-server) exposes this machine's coding CLIs
 * as protocol skills. Server-side logic lives in a2a.server.ts.
 */

export interface A2ASkillSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface AgentCardSummary {
  name: string;
  description: string;
  version: string;
  url: string;
  streaming: boolean;
  skills: A2ASkillSummary[];
}

/** One line of the transaction ledger — written by the Python server. */
export interface A2ATaskRecord {
  taskId: string;
  contextId: string;
  skill: string;
  state: "submitted" | "working" | "completed" | "failed" | "canceled";
  startedAt: string;
  endedAt: string;
  promptChars: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string;
}

export interface A2AStatus {
  up: boolean;
  baseUrl: string;
  detail: string;
  card: AgentCardSummary | null;
}

export interface A2ATelemetry {
  totalTasks: number;
  completed: number;
  failed: number;
  canceled: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byDay: { day: string; tasks: number; costUsd: number }[];
  bySkill: { skill: string; tasks: number; costUsd: number }[];
}
