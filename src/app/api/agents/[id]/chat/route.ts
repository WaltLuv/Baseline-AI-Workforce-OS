import { AGENT_BY_ID } from "@/lib/agents";
import { chatStream, makeStreamId, NDJSON_HEADERS, type ChatMsg } from "@/lib/chatStream";
import { ensureProject } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spec = AGENT_BY_ID[id];
  if (!spec) return new Response("unknown agent", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: unknown;
    history?: unknown;
    project?: unknown;
    model?: unknown;
  };

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return new Response("missing prompt", { status: 400 });
  if (prompt.length > 32_000) return new Response("prompt too long", { status: 413 });

  const history: ChatMsg[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter((m): m is ChatMsg => {
          const msg = m as ChatMsg;
          return Boolean(msg) && (msg.role === "user" || msg.role === "assistant") && typeof msg.text === "string";
        })
        .slice(-40)
    : [];

  // Every agent gets its own workspace project, so file writes are contained.
  const project = typeof body.project === "string" && body.project ? body.project : `${spec.id}-workspace`;
  const cwd = await ensureProject(project);

  const streamId = makeStreamId();
  const stream = chatStream({
    spec,
    prompt,
    history,
    cwd,
    model: typeof body.model === "string" ? body.model : undefined,
    streamId,
  });

  return new Response(stream, { headers: { ...NDJSON_HEADERS, "X-Stream-Id": streamId } });
}
