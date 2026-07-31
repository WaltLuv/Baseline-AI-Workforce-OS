import { NextResponse } from "next/server";
import { buildPulse } from "@/lib/pulse.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildPulse());
}
