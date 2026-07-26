import { NextResponse } from "next/server";
import { buildGraph, listNotes, readNote, searchNotes } from "@/lib/memory";
import { loadConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?view=graph|search|recent|note */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "recent";
  const cfg = loadConfig();

  if (view === "graph") {
    return NextResponse.json({ graph: await buildGraph(), vault: cfg.vaultRoot });
  }
  if (view === "search") {
    const q = url.searchParams.get("q") ?? "";
    return NextResponse.json({ hits: await searchNotes(q), vault: cfg.vaultRoot });
  }
  if (view === "note") {
    const root = url.searchParams.get("root") === "vault" ? "vault" : "workforce";
    const rel = url.searchParams.get("path") ?? "";
    const note = await readNote(root, rel);
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...note, path: rel, root });
  }

  const notes = await listNotes();
  return NextResponse.json({ notes: notes.slice(0, 60), total: notes.length, vault: cfg.vaultRoot });
}
