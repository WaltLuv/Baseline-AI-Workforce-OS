import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { allStatuses } from "@/lib/agents.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const probe = new URL(req.url).searchParams.get("probe") === "1";
  const statuses = await allStatuses(probe);
  return NextResponse.json({
    agents: AGENTS,
    statuses,
    connected: statuses.filter((s) => s.connected).length,
    total: statuses.length,
  });
}
