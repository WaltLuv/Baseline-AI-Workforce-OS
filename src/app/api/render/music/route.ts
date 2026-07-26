import { NextResponse } from "next/server";
import { generateMusic, musicStatus } from "@/lib/suno";
import { requireIntegration } from "@/lib/integrations.server";
import { saveRemote, stamp } from "@/lib/media";
import { readJson, writeJson, newId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT = "music-studio";
const STORE = "boards/music-renders.json";

export interface MusicJob {
  id: string;
  taskId: string;
  title: string;
  prompt: string;
  style: string;
  instrumental: boolean;
  status: string;
  tracks: { id: string; title: string; file: string | null; url: string | null; duration: number | null }[];
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

async function jobs(): Promise<MusicJob[]> {
  return readJson<MusicJob[]>(STORE, []);
}
async function saveJobs(list: MusicJob[]) {
  await writeJson(STORE, list.slice(0, 60));
}

function fail(e: unknown, status = 400) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

export async function GET() {
  return NextResponse.json({ jobs: await jobs(), project: PROJECT });
}

export async function POST(req: Request) {
  try {
    requireIntegration("suno");
    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      style?: string;
      title?: string;
      instrumental?: boolean;
      customMode?: boolean;
    };
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) return NextResponse.json({ error: "a prompt or lyrics are required" }, { status: 400 });

    const taskId = await generateMusic({
      prompt,
      style: body.style,
      title: body.title,
      instrumental: body.instrumental,
      customMode: body.customMode,
    });

    const job: MusicJob = {
      id: newId("mus"),
      taskId,
      title: body.title?.slice(0, 80) || "Untitled",
      prompt: prompt.slice(0, 3000),
      style: body.style ?? "",
      instrumental: Boolean(body.instrumental),
      status: "PENDING",
      tracks: [],
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveJobs([job, ...(await jobs())]);
    return NextResponse.json({ job });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    const list = await jobs();
    const job = list.find((j) => j.id === id);
    if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
    if (job.tracks.some((t) => t.file)) return NextResponse.json({ job, project: PROJECT });

    requireIntegration("suno");
    const status = await musicStatus(job.taskId);
    job.status = status.status;
    job.error = status.error;
    job.updatedAt = Date.now();

    job.tracks = await Promise.all(
      status.tracks.map(async (t, i) => {
        const existing = job.tracks.find((x) => x.id === t.id);
        if (existing?.file) return existing;
        let file: string | null = null;
        if (t.audioUrl) {
          // Suno deletes generated files after ~15 days; keep a local copy now.
          file = await saveRemote(PROJECT, t.audioUrl, `suno-${stamp()}-${i + 1}`).catch(() => null);
        }
        return { id: t.id, title: t.title, file, url: t.audioUrl, duration: t.duration };
      }),
    );

    await saveJobs(list);
    return NextResponse.json({ job, project: PROJECT });
  } catch (e) {
    return fail(e);
  }
}
