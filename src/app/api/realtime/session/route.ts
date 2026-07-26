import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived client secret for the Realtime API so the browser can
 * open a WebRTC session without ever seeing your API key. Tokens are minutes
 * long by design; the page asks for a new one each time you start talking.
 */
export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set — realtime voice needs it. Push-to-talk voice works without any key." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { instructions?: string; voice?: string };
  const model = process.env.REALTIME_MODEL ?? "gpt-realtime";

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: {
            output: { voice: body.voice || process.env.REALTIME_VOICE || "alloy" },
          },
          ...(body.instructions ? { instructions: body.instructions.slice(0, 8000) } : {}),
        },
      }),
    });

    const text = await res.text();
    let json: { value?: string; client_secret?: { value?: string }; error?: { message?: string } } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* provider error page */
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Realtime ${res.status}: ${json?.error?.message ?? text.slice(0, 300)}` },
        { status: 400 },
      );
    }

    // The endpoint has returned the secret both bare and wrapped; accept either.
    const secret = json?.value ?? json?.client_secret?.value;
    if (!secret) return NextResponse.json({ error: "no client secret in the response" }, { status: 400 });

    return NextResponse.json({ secret, model });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
