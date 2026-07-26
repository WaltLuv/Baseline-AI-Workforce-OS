import { NextResponse } from "next/server";
import { INTEGRATIONS } from "@/lib/integrations";
import { allIntegrationStatuses } from "@/lib/integrations.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ integrations: INTEGRATIONS, statuses: allIntegrationStatuses() });
}
