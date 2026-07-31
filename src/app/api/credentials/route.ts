import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/credentials";
import {
  CREDENTIALS_STORE_PATH,
  allProviderStatuses,
  deleteStoredSecret,
  providerStatus,
  setStoredSecret,
} from "@/lib/credentials.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalog + statuses. Masked previews only — raw values never leave the server. */
export async function GET() {
  return NextResponse.json({
    providers: PROVIDERS,
    statuses: allProviderStatuses(),
    storePath: CREDENTIALS_STORE_PATH,
  });
}

export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  let body: { value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const value = (body.value ?? "").trim();
  if (!id || !value) return NextResponse.json({ error: "id and value are required" }, { status: 400 });
  try {
    setStoredSecret(id, value);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: providerStatus(id) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteStoredSecret(id);
  return NextResponse.json({ ok: true, status: providerStatus(id) });
}
