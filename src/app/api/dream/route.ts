import { NextRequest, NextResponse } from "next/server";
import { NDJSON_HEADERS } from "@/lib/chatStream";
import { latestDream, listDreams, readDream, runDream, writeScheduleArtifacts } from "@/lib/dream.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (date) {
    const dream = readDream(date);
    if (!dream) return NextResponse.json({ error: "no dream for that date" }, { status: 404 });
    return NextResponse.json(dream);
  }
  return NextResponse.json({ latest: latestDream(), history: listDreams().map((d) => d.date) });
}

/** action "run" streams NDJSON and writes the dated file; "schedule" generates installables. */
export async function POST(req: NextRequest) {
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.action === "schedule") {
    return NextResponse.json(writeScheduleArtifacts());
  }

  if (body.action !== "run") return NextResponse.json({ error: "unknown action" }, { status: 400 });

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
      emit({ t: "meta", command: "dream review · audit last 24h → top 4 prescriptions" });
      try {
        const dream = await runDream(emit);
        if (dream) emit({ t: "text", text: JSON.stringify(dream) });
        emit({ t: "end", code: dream ? 0 : 1, ok: Boolean(dream) });
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
