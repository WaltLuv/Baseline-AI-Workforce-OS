import { NextResponse } from "next/server";
import { fetchRawCard } from "@/lib/a2a.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const card = await fetchRawCard();
  if (!card) return NextResponse.json({ error: "A2A server is not answering" }, { status: 503 });
  return NextResponse.json(card);
}
