import { NextResponse } from "next/server";
import { listMcpServers, listSkills } from "@/lib/claudeData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [skills, mcp] = await Promise.all([listSkills(process.cwd()), listMcpServers()]);
  return NextResponse.json({ skills, mcp });
}
