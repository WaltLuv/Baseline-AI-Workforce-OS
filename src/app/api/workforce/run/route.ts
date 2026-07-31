import { resolveAgentSpec } from "@/lib/agents.server";
import { chatStream, makeStreamId, NDJSON_HEADERS } from "@/lib/chatStream";
import { buildRunPrompt, getAgent, recordRun, workforceRoot, WORKFORCE_PROJECT } from "@/lib/workforce";
import { listFiles } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Run one workforce agent against one input.
 *
 * Same NDJSON protocol as chat, with two extra events at the end:
 *   {"t":"files","files":[…]}   what the run touched in the workforce project
 *   {"t":"text","text":"…"}     the complete output, saved to run history
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    agent?: string;
    input?: string;
    engine?: string;
  };

  const slug = String(body.agent ?? "");
  const input = String(body.input ?? "").trim();
  if (!slug) return new Response("agent required", { status: 400 });
  if (!input) return new Response("input required", { status: 400 });
  if (input.length > 32_000) return new Response("input too long", { status: 413 });

  const agent = await getAgent(slug);
  if (!agent) return new Response("unknown agent", { status: 404 });

  // Any file-capable engine can drive a workforce agent; Claude Code is default.
  const spec = resolveAgentSpec(body.engine ?? "claude");
  if (!spec) return new Response("unknown engine", { status: 404 });

  const cwd = await workforceRoot();
  const streamId = makeStreamId();
  const before = new Set((await listFiles(cwd).catch(() => [])).map((f) => f.rel));

  const source = chatStream({
    spec,
    prompt: buildRunPrompt(agent, input),
    history: [],
    cwd,
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
      let ok = false;
      let costUsd = 0;
      let tokens = 0;

      const emit = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
        carry += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = carry.indexOf("\n")) >= 0) {
          const line = carry.slice(0, idx);
          carry = carry.slice(idx + 1);
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as {
              t?: string;
              text?: string;
              ok?: boolean;
              costUsd?: number;
              input?: number;
              output?: number;
            };
            if (evt.t === "delta" && typeof evt.text === "string") streamed += evt.text;
            else if (evt.t === "final" && typeof evt.text === "string") finalText = evt.text;
            else if (evt.t === "usage") {
              costUsd = evt.costUsd ?? 0;
              tokens = (evt.input ?? 0) + (evt.output ?? 0);
            } else if (evt.t === "end") ok = Boolean(evt.ok);
          } catch {
            /* not our event */
          }
        }
      }

      // `final` repeats the deltas on CLIs that send both.
      const text = streamed.trim() ? streamed : finalText;

      const after = await listFiles(cwd).catch(() => []);
      const touched = after
        .filter((f) => !before.has(f.rel) || f.updatedAt > Date.now() - 10 * 60_000)
        .slice(0, 40)
        .map((f) => f.rel);
      if (touched.length) emit({ t: "files", files: touched });

      await recordRun({
        agent: slug,
        input: input.slice(0, 4000),
        output: text.slice(0, 40_000),
        files: touched,
        at: Date.now(),
        ok,
        costUsd,
        tokens,
      }).catch(() => {});

      emit({ t: "text", text, project: WORKFORCE_PROJECT });
      controller.close();
    },
  });

  return new Response(out, { headers: { ...NDJSON_HEADERS, "X-Stream-Id": streamId } });
}
