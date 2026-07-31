import { NextRequest, NextResponse } from "next/server";
import { buildRoiReport, readLibrary, setEstimate } from "@/lib/skillsRoi.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ roi: await buildRoiReport(), library: readLibrary() });
}

export async function PUT(req: NextRequest) {
  let body: { name?: string; minutesPerRun?: number; runsPerMonth?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  setEstimate(body.name, { minutesPerRun: body.minutesPerRun ?? 0, runsPerMonth: body.runsPerMonth ?? 0 });
  return NextResponse.json({ ok: true, roi: await buildRoiReport() });
}
