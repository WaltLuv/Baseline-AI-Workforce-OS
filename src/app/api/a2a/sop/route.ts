import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the A2A server's SOP + SWARM docs (read-only, from the repo). */
export async function GET() {
  const docsDir = path.resolve(process.cwd(), "..", "a2a-server", "docs");
  const read = (name: string): string | null => {
    try {
      return readFileSync(path.join(docsDir, name), "utf8");
    } catch {
      return null;
    }
  };
  return NextResponse.json({ sop: read("SOP.md"), swarm: read("SWARM.md") });
}
