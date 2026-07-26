import { NextResponse } from "next/server";
import { listSessions, rollup } from "@/lib/claudeData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 40);
  const sessions = await listSessions(Number.isFinite(limit) ? Math.min(120, Math.max(1, limit)) : 40);
  return NextResponse.json({ sessions, usage: rollup(sessions) });
}
