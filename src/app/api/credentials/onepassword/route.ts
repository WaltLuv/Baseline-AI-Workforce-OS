import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_VAULT,
  OP_MAPPING_PATH,
  generateEnvTemplate,
  opStatus,
  readOpMappings,
  scanTextForLeaks,
  setOpMapping,
  validateReference,
} from "@/lib/onepassword.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: opStatus(),
    mappings: readOpMappings(),
    template: generateEnvTemplate(),
    defaultVault: DEFAULT_VAULT,
    mappingPath: OP_MAPPING_PATH,
  });
}

/** action: "validate" {ref} → parse/resolve booleans · "scan" {text} → leak hits. */
export async function POST(req: NextRequest) {
  let body: { action?: string; ref?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.action === "validate") {
    return NextResponse.json(validateReference(body.ref ?? ""));
  }
  if (body.action === "scan") {
    return NextResponse.json({ hits: scanTextForLeaks(body.text ?? "") });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  let body: { id?: string; ref?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    setOpMapping(body.id, body.ref ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, mappings: readOpMappings() });
}
