import { NextResponse } from "next/server";
import { FEATURES } from "@/lib/features";
import { allFeatureStatuses } from "@/lib/features.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ features: FEATURES, statuses: allFeatureStatuses() });
}
