import { NextResponse } from "next/server";
import { probeA2A } from "@/lib/a2a.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await probeA2A());
}
