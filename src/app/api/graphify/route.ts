import { NextRequest, NextResponse } from "next/server";
import { godNodes, graphHealth, queryGraph } from "@/lib/graphify";
import { GRAPHIFY_CACHE_PATH, loadGraphify } from "@/lib/graphify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=<question> ranks files · ?refresh=1 rebuilds · plain GET returns graph+health. */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const graph = loadGraphify(refresh);
  if (q) {
    return NextResponse.json({ query: q, hits: queryGraph(graph, q), generatedAt: graph.generatedAt });
  }
  return NextResponse.json({
    graph,
    health: graphHealth(graph),
    godNodes: godNodes(graph),
    cachePath: GRAPHIFY_CACHE_PATH,
  });
}
