import { NextResponse } from "next/server";
import { readJson, writeJson, safeSlug } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic local document store for the board-shaped surfaces: Kanban, Agent
 * Kanban, Pipeline, Paperclip, Loop runs, and each studio's saved briefs.
 * One JSON file per board under ~/.baseline-workforce/boards/.
 */
const ALLOWED = new Set([
  "kanban",
  "agent-kanban",
  "pipeline",
  "paperclip",
  "loop",
  "radar",
  "astros",
  "leads",
  "seo",
  "video",
  "video-use",
  "openmontage",
  "music",
  "games",
  "apps",
  "thumbnails",
  "opendesign",
  "notebook",
  "room",
  "understand",
  "leads-pipeline",
]);

function boardFile(name: string): string | null {
  const slug = safeSlug(name, "");
  if (!slug || !ALLOWED.has(slug)) return null;
  return `boards/${slug}.json`;
}

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const file = boardFile(name);
  if (!file) return NextResponse.json({ error: "unknown board" }, { status: 400 });
  const doc = await readJson<Record<string, unknown>>(file, {});
  return NextResponse.json({ name, doc });
}

export async function PUT(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const file = boardFile(name);
  if (!file) return NextResponse.json({ error: "unknown board" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad body" }, { status: 400 });
  const payload = JSON.stringify(body);
  if (payload.length > 4_000_000) return NextResponse.json({ error: "board too large" }, { status: 413 });
  await writeJson(file, { ...(body as object), updatedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
