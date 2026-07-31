import { NextResponse } from "next/server";
import { higgsfieldOverview } from "@/lib/higgsfield.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await higgsfieldOverview());
}
