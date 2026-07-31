import { NextRequest, NextResponse } from "next/server";
import { domainSearch, emailFinder } from "@/lib/hunter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** mode "domain" {domain} · mode "finder" {domain, firstName, lastName}. */
export async function POST(req: NextRequest) {
  let body: { mode?: string; domain?: string; firstName?: string; lastName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    if (body.mode === "finder") {
      if (!body.domain || !body.firstName || !body.lastName) {
        return NextResponse.json({ error: "domain, firstName and lastName are required" }, { status: 400 });
      }
      return NextResponse.json(await emailFinder(body.domain, body.firstName, body.lastName));
    }
    if (!body.domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
    return NextResponse.json(await domainSearch(body.domain.trim().replace(/^https?:\/\//, "").split("/")[0]));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
