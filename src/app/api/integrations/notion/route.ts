import { NextRequest, NextResponse } from "next/server";
import { notionRecent, notionSearch } from "@/lib/notion.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (q) return NextResponse.json(await notionSearch(q));
  return NextResponse.json(await notionRecent(req.nextUrl.searchParams.get("refresh") === "1"));
}
