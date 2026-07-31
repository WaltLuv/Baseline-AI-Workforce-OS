import { NextResponse } from "next/server";
import { buildBrain } from "@/lib/brain.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildBrain());
}
