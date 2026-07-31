import { NextResponse } from "next/server";
import { listAutomations } from "@/lib/automations.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ automations: listAutomations() });
}
