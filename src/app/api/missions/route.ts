import { NextRequest, NextResponse } from "next/server";
import { NDJSON_HEADERS } from "@/lib/chatStream";
import { listMissions, runMission } from "@/lib/missions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET() {
  return NextResponse.json({ missions: listMissions() });
}

/** Run a mission; the response streams the whole thing as NDJSON events. */
export async function POST(req: NextRequest) {
  let body: { goal?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const goal = (body.goal ?? "").trim();
  if (!goal) return NextResponse.json({ error: "goal is required" }, { status: 400 });
  if (goal.length > 8_000) return NextResponse.json({ error: "goal too long" }, { status: 413 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (obj: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          closed = true;
        }
      };
      emit({ t: "meta", command: "mission · plan → run specialists → integrate" });
      try {
        const mission = await runMission(goal, emit);
        emit({ t: "end", code: mission.status === "done" ? 0 : 1, ok: mission.status === "done" });
      } catch (e) {
        emit({ t: "err", text: e instanceof Error ? e.message : String(e) });
        emit({ t: "end", code: 1, ok: false });
      }
      try {
        controller.close();
      } catch {
        /* closed */
      }
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}
