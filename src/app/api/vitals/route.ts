import { NextResponse } from "next/server";
import os from "node:os";
import { existsSync } from "node:fs";
import { loadConfig, WORKFORCE_HOME } from "@/lib/config";
import { allStatuses } from "@/lib/agents.server";
import { listSessions, rollup } from "@/lib/claudeData";
import { readGoals } from "@/lib/vaultWriter";
import { listProjects } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything Mission Control needs, in one round trip. */
export async function GET() {
  const cfg = loadConfig();
  const [statuses, sessions, goals, projects] = await Promise.all([
    allStatuses(false),
    listSessions(30),
    readGoals(),
    listProjects(),
  ]);

  const usage = rollup(sessions);
  const dayAgo = Date.now() - 86_400_000;
  const load = os.loadavg()[0];

  return NextResponse.json({
    host: {
      user: cfg.userName,
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpus: os.cpus().length,
      loadAvg: Number(load.toFixed(2)),
      memTotal: os.totalmem(),
      memFree: os.freemem(),
      uptime: os.uptime(),
      location: cfg.locationLabel,
    },
    paths: {
      home: WORKFORCE_HOME,
      workspace: cfg.workspaceRoot,
      vault: cfg.vaultRoot,
      vaultExists: cfg.vaultRoot ? existsSync(cfg.vaultRoot) : false,
    },
    agents: {
      connected: statuses.filter((s) => s.connected).length,
      total: statuses.length,
      statuses,
    },
    work: {
      sessionsToday: sessions.filter((s) => s.updatedAt > dayAgo).length,
      recent: sessions.slice(0, 6).map((s) => ({
        id: s.id,
        key: s.key,
        project: s.project,
        firstPrompt: s.firstPrompt,
        updatedAt: s.updatedAt,
        messages: s.messages,
        toolCalls: s.toolCalls,
      })),
      usage,
      projects: projects.slice(0, 6),
    },
    goals: {
      open: goals.filter((g) => !g.done).length,
      done: goals.filter((g) => g.done).length,
      next: goals.filter((g) => !g.done).slice(0, 5),
    },
  });
}
