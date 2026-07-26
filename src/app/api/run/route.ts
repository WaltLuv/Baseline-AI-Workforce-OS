import { AGENT_BY_ID } from "@/lib/agents";
import { chatStream, makeStreamId, NDJSON_HEADERS, type ChatMsg } from "@/lib/chatStream";
import { ensureProject, extractFiles, listFiles } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * One-shot agent run, used by every studio page (App Lab, Games, SEO, Radar,
 * Loop, Design, …). Same NDJSON protocol as chat, with two extra events at the
 * end:
 *   {"t":"files","files":["index.html"]}   files written into the project
 *   {"t":"text","text":"…"}                the complete reply, for saving
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    agent?: string;
    prompt?: string;
    project?: string;
    model?: string;
    history?: ChatMsg[];
    extract?: boolean;
  };

  const spec = AGENT_BY_ID[body.agent ?? "claude"];
  if (!spec) return new Response("unknown agent", { status: 404 });

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return new Response("missing prompt", { status: 400 });
  if (prompt.length > 32_000) return new Response("prompt too long", { status: 413 });

  const project = body.project && typeof body.project === "string" ? body.project : `${spec.id}-runs`;
  const cwd = await ensureProject(project);
  const streamId = makeStreamId();

  const source = chatStream({
    spec,
    prompt,
    history: Array.isArray(body.history) ? body.history.slice(-20) : [],
    cwd,
    model: body.model,
    streamId,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      let carry = "";
      let streamed = "";
      let finalText = "";

      const push = (chunk: Uint8Array) => controller.enqueue(chunk);
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        push(value);
        carry += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = carry.indexOf("\n")) >= 0) {
          const line = carry.slice(0, idx);
          carry = carry.slice(idx + 1);
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { t?: string; text?: string };
            // `final` repeats what the deltas already carried on CLIs that send
            // both, so only fall back to it when nothing streamed.
            if (evt.t === "delta" && typeof evt.text === "string") streamed += evt.text;
            else if (evt.t === "final" && typeof evt.text === "string") finalText = evt.text;
          } catch {
            /* not our event */
          }
        }
      }

      const full = streamed.trim() ? streamed : finalText;

      // A CLI agent writes its own files; an HTTP agent hands back fenced blocks.
      if (body.extract !== false && spec.buildsFiles && spec.backend === "http") {
        try {
          const files = await extractFiles(project, full);
          if (files.length) emit({ t: "files", files });
        } catch (e) {
          emit({ t: "err", text: `could not write files: ${e instanceof Error ? e.message : String(e)}` });
        }
      } else if (spec.backend === "cli") {
        const files = await listFiles(cwd).catch(() => []);
        if (files.length) emit({ t: "files", files: files.slice(0, 40).map((f) => f.rel) });
      }

      emit({ t: "text", text: full, project });
      controller.close();
    },
  });

  return new Response(out, { headers: { ...NDJSON_HEADERS, "X-Stream-Id": streamId } });
}
