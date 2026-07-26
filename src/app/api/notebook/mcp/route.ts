import { NextResponse } from "next/server";
import { dropMcpClient, mcpClient } from "@/lib/mcp";
import { which } from "@/lib/config";
import { INTEGRATION_BY_ID } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The NotebookLM MCP server binary, overridable for a custom install. */
function server(): { bin: string; args: string[] } {
  const explicit = process.env.NOTEBOOKLM_MCP_BIN;
  const bin = explicit ?? which("notebooklm-mcp");
  if (!bin) {
    const integration = INTEGRATION_BY_ID.notebooklm;
    throw new Error(`notebooklm-mcp is not installed. ${integration.install.split("\n")[0]}`);
  }
  const args = (process.env.NOTEBOOKLM_MCP_ARGS ?? "").split(" ").filter(Boolean);
  return { bin, args };
}

/** List the tools the MCP server actually exposes — never a hardcoded guess. */
export async function GET() {
  try {
    const { bin, args } = server();
    const client = await mcpClient(bin, args);
    const tools = await client.listTools();
    return NextResponse.json({ connected: true, bin, tools });
  } catch (e) {
    return NextResponse.json(
      { connected: false, tools: [], error: e instanceof Error ? e.message : String(e) },
      { status: 200 }, // a missing server is a state, not a request failure
    );
  }
}

/** Call one of those tools. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tool?: string; args?: Record<string, unknown> };
    if (!body.tool) return NextResponse.json({ error: "tool is required" }, { status: 400 });

    const { bin, args } = server();
    const client = await mcpClient(bin, args);
    const result = await client.callTool(body.tool, body.args ?? {});
    return NextResponse.json({ ...result, tool: body.tool });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** Restart the server — the usual fix after re-authenticating. */
export async function DELETE() {
  try {
    const { bin, args } = server();
    dropMcpClient(bin, args);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
