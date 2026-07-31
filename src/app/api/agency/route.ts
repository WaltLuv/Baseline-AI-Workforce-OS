import { NextRequest, NextResponse } from "next/server";
import { agencyAgentBody, agencyDivision, agencyOverview } from "@/lib/agency.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const division = req.nextUrl.searchParams.get("division");
  const agent = req.nextUrl.searchParams.get("agent");
  if (division && agent) {
    const body = agencyAgentBody(division, agent);
    if (body === null) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ body });
  }
  if (division) return NextResponse.json({ agents: agencyDivision(division) });
  return NextResponse.json(agencyOverview());
}
