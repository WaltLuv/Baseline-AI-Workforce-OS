import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentPath, documentPreview, listDocuments, setDocumentHidden } from "@/lib/documents.server";
import { contentTypeFor } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("file");
  const preview = req.nextUrl.searchParams.get("preview");
  if (name && preview) {
    const p = documentPreview(name);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(p);
  }
  if (name) {
    const abs = documentPath(name);
    if (!abs) return NextResponse.json({ error: "not found" }, { status: 404 });
    const body = readFileSync(abs);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentTypeFor(path.basename(abs)) ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      },
    });
  }
  const includeHidden = req.nextUrl.searchParams.get("hidden") === "1";
  return NextResponse.json(listDocuments(includeHidden));
}

/** Hide/unhide — the source dir is read-only, so nothing is ever deleted. */
export async function PATCH(req: NextRequest) {
  let body: { name?: string; hidden?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  try {
    setDocumentHidden(body.name, Boolean(body.hidden));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...listDocuments(true) });
}
