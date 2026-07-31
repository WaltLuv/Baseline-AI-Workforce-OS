import { NextResponse } from "next/server";
import { ompOverview } from "@/lib/omp.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(ompOverview());
}
