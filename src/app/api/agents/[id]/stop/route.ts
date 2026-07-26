import { NextResponse } from "next/server";
import { stopProc } from "@/lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { streamId } = (await req.json().catch(() => ({}))) as { streamId?: string };
  if (typeof streamId !== "string" || !streamId) {
    return NextResponse.json({ error: "streamId required" }, { status: 400 });
  }
  const stopped = stopProc(streamId);
  return NextResponse.json({ stopped });
}
