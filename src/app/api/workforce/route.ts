import { NextResponse } from "next/server";
import { getAgent, installStarter, listAgents, listRuns, overview, retireAgent, saveAgent } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("agent");

  if (slug) {
    const agent = await getAgent(slug);
    if (!agent) return NextResponse.json({ error: "unknown agent" }, { status: 404 });
    return NextResponse.json({ agent, runs: await listRuns(slug, 25) });
  }

  const [agents, info, runs] = await Promise.all([listAgents(), overview(), listRuns(undefined, 25)]);
  return NextResponse.json({ agents, overview: info, runs });
}

/** Create or update an agent. */
export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      spec?: string;
      contract?: string;
      tests?: string;
    };
    if (!body.name?.trim()) return NextResponse.json({ error: "an agent needs a name" }, { status: 400 });
    if (!body.contract?.trim()) return NextResponse.json({ error: "an agent needs a contract" }, { status: 400 });
    if ((body.spec ?? "").length + (body.contract ?? "").length > 200_000) {
      return NextResponse.json({ error: "spec and contract are too long" }, { status: 413 });
    }

    const agent = await saveAgent({
      slug: body.slug,
      name: body.name,
      spec: body.spec ?? "",
      contract: body.contract,
      tests: body.tests,
    });
    return NextResponse.json({ agent });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** Install the starter three-agent workforce. Never overwrites existing files. */
export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "install-starter") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  try {
    const result = await installStarter();
    return NextResponse.json({ ...result, agents: await listAgents() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("agent");
  if (!slug) return NextResponse.json({ error: "agent required" }, { status: 400 });
  await retireAgent(slug);
  return NextResponse.json({ ok: true });
}
