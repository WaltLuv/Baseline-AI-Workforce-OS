import { NextRequest } from "next/server";
import { NDJSON_HEADERS, makeStreamId } from "@/lib/chatStream";
import { sendMessageStream } from "@/lib/a2a.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/** Stream one A2A task through the local server, as the app's NDJSON protocol. */
export async function POST(req: NextRequest) {
  let body: { skill?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });
  const skill = (body.skill ?? "").trim();
  const streamId = makeStreamId();

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
      emit({ t: "meta", streamId, command: `A2A message/stream${skill ? ` · skill=${skill}` : ""}` });
      try {
        await sendMessageStream(skill, prompt, emit);
        emit({ t: "end", code: 0, ok: true });
      } catch (e) {
        emit({ t: "err", text: e instanceof Error ? e.message : String(e) });
        emit({ t: "end", code: 1, ok: false });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, { headers: { ...NDJSON_HEADERS, "X-Stream-Id": streamId } });
}
