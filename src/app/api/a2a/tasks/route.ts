import { NextRequest, NextResponse } from "next/server";
import { readTransactions, telemetry } from "@/lib/a2a.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200)));
  const records = readTransactions(limit);
  return NextResponse.json({ records, telemetry: telemetry(records) });
}
