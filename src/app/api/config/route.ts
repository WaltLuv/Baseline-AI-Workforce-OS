import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { CONFIG_PATH, WORKFORCE_HOME, loadConfig } from "@/lib/config";
import { readJson, writeJson } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE = new Set([
  "userName",
  "vaultRoot",
  "vaultFolder",
  "workspaceRoot",
  "claudeModel",
  "permissionMode",
  "bins",
  "argv",
  "goalCategories",
  "locationLabel",
  "a2aBaseUrl",
  "subscriptions",
  "hourlyRateUsd",
  "customAgents",
]);

export async function GET() {
  const cfg = loadConfig();
  return NextResponse.json({
    config: cfg,
    configPath: CONFIG_PATH,
    home: WORKFORCE_HOME,
    vaultExists: cfg.vaultRoot ? existsSync(cfg.vaultRoot) : false,
  });
}

/** Merge-patch: only the keys you send change. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await readJson<Record<string, unknown>>("config.json", {});
  const next = { ...current };
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.has(key)) {
      rejected.push(key);
      continue;
    }
    if (key === "vaultRoot" && typeof value === "string" && value && !existsSync(value)) {
      return NextResponse.json({ error: `No folder at ${value}` }, { status: 400 });
    }
    next[key] = value;
  }

  await writeJson("config.json", next);
  return NextResponse.json({ ok: true, config: loadConfig(), rejected, configPath: CONFIG_PATH });
}
