import { NextResponse } from "next/server";
import { deletePersona, listPersonas, overview, savePersona } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [personas, info] = await Promise.all([listPersonas(), overview()]);
  return NextResponse.json({ personas, overview: info });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      role?: string;
      model?: string;
      temperature?: number | null;
      systemPrompt?: string;
      tags?: string[];
    };
    if (!body.name?.trim()) return NextResponse.json({ error: "a persona needs a name" }, { status: 400 });
    if ((body.systemPrompt ?? "").length > 40_000) {
      return NextResponse.json({ error: "system prompt is too long" }, { status: 413 });
    }
    const persona = await savePersona({
      slug: body.slug,
      name: body.name,
      role: body.role,
      model: body.model,
      temperature: body.temperature,
      systemPrompt: body.systemPrompt,
      tags: body.tags,
    });
    return NextResponse.json({ persona });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  try {
    await deletePersona(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
