import { NextRequest, NextResponse } from "next/server";
import { pineconeState } from "@/lib/pinecone.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json(await pineconeState(req.nextUrl.searchParams.get("refresh") === "1"));
}
