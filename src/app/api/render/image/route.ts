import { NextResponse } from "next/server";
import { renderImage } from "@/lib/images";
import { requireIntegration } from "@/lib/integrations.server";
import { readJson, writeJson, newId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STORE = "boards/image-renders.json";

export interface ImageJob {
  id: string;
  prompt: string;
  project: string;
  file: string;
  model: string;
  revisedPrompt: string | null;
  bytes: number;
  createdAt: number;
}

export async function GET() {
  return NextResponse.json({ jobs: await readJson<ImageJob[]>(STORE, []) });
}

export async function POST(req: Request) {
  try {
    requireIntegration("images");
    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      project?: string;
      size?: "1536x1024" | "1024x1024" | "1024x1536";
      quality?: "low" | "medium" | "high";
      name?: string;
    };

    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) return NextResponse.json({ error: "a prompt is required" }, { status: 400 });

    const project = body.project || "thumbnails";
    const result = await renderImage({
      prompt,
      project,
      size: body.size,
      quality: body.quality,
      name: body.name,
    });

    const job: ImageJob = {
      id: newId("img"),
      prompt: prompt.slice(0, 2000),
      project,
      file: result.file,
      model: result.model,
      revisedPrompt: result.revisedPrompt,
      bytes: result.bytes,
      createdAt: Date.now(),
    };
    const list = await readJson<ImageJob[]>(STORE, []);
    await writeJson(STORE, [job, ...list].slice(0, 60));

    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
