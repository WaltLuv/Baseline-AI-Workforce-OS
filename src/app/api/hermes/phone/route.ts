import { NextResponse } from "next/server";
import { qrFor, startTunnel, stopTunnel, tunnelStatus, type TunnelProvider } from "@/lib/tunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function withQr(status: ReturnType<typeof tunnelStatus>) {
  const target = status.url ?? status.lan[0] ?? null;
  const qr = target ? await qrFor(target).catch(() => null) : null;
  return { ...status, target, qr };
}

export async function GET() {
  return NextResponse.json(await withQr(tunnelStatus()));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; provider?: TunnelProvider };

  if (body.action === "stop") {
    stopTunnel();
    return NextResponse.json(await withQr(tunnelStatus()));
  }

  if (body.action === "start") {
    const provider = body.provider === "ngrok" ? "ngrok" : "cloudflared";
    try {
      await startTunnel(provider);
      return NextResponse.json(await withQr(tunnelStatus()));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "action must be start or stop" }, { status: 400 });
}
