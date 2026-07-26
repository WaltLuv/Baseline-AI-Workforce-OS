import { NextResponse } from "next/server";
import { AGENT_BY_ID } from "@/lib/agents";
import { clearConversation, readConversation, writeConversation, type StoredMessage } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!AGENT_BY_ID[id]) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const convo = await readConversation(id);
  return NextResponse.json(convo);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!AGENT_BY_ID[id]) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { messages?: StoredMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  await writeConversation(id, messages);
  return NextResponse.json({ ok: true, count: messages.length });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await clearConversation(id);
  return NextResponse.json({ ok: true });
}
