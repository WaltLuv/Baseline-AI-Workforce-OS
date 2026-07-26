import { NextResponse } from "next/server";
import { generateVideo, listAvatars, listVoices, videoStatus } from "@/lib/heygen";
import { requireIntegration } from "@/lib/integrations.server";
import { saveRemote, stamp } from "@/lib/media";
import { readJson, writeJson, newId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT = "video-studio";
const STORE = "boards/video-renders.json";

export interface RenderJob {
  id: string;
  videoId: string;
  title: string;
  script: string;
  avatarId: string;
  voiceId: string;
  aspect: string;
  test: boolean;
  status: string;
  file: string | null;
  thumbnail: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

async function jobs(): Promise<RenderJob[]> {
  return readJson<RenderJob[]>(STORE, []);
}
async function saveJobs(list: RenderJob[]) {
  await writeJson(STORE, list.slice(0, 60));
}

function fail(e: unknown, status = 400) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

/** ?view=catalog lists avatars + voices; default returns the job list. */
export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get("view");
  if (view === "catalog") {
    try {
      requireIntegration("heygen");
      const [avatars, voices] = await Promise.all([listAvatars(), listVoices()]);
      return NextResponse.json({ avatars, voices });
    } catch (e) {
      return fail(e);
    }
  }
  return NextResponse.json({ jobs: await jobs(), project: PROJECT });
}

/** Start a render. */
export async function POST(req: Request) {
  try {
    requireIntegration("heygen");
    const body = (await req.json().catch(() => ({}))) as {
      script?: string;
      avatarId?: string;
      voiceId?: string;
      avatarKind?: "avatar" | "talking_photo";
      title?: string;
      aspect?: "16:9" | "9:16" | "1:1";
      test?: boolean;
    };

    const script = String(body.script ?? "").trim();
    if (!script) return NextResponse.json({ error: "script is required" }, { status: 400 });
    if (script.length > 12_000) return NextResponse.json({ error: "script is too long for one render" }, { status: 413 });
    if (!body.avatarId || !body.voiceId) {
      return NextResponse.json({ error: "pick an avatar and a voice first" }, { status: 400 });
    }

    const videoId = await generateVideo({
      script,
      avatarId: body.avatarId,
      voiceId: body.voiceId,
      avatarKind: body.avatarKind,
      title: body.title,
      aspect: body.aspect,
      test: body.test ?? true,
    });

    const job: RenderJob = {
      id: newId("vid"),
      videoId,
      title: body.title?.slice(0, 120) || "Untitled render",
      script: script.slice(0, 4000),
      avatarId: body.avatarId,
      voiceId: body.voiceId,
      aspect: body.aspect ?? "16:9",
      test: body.test ?? true,
      status: "processing",
      file: null,
      thumbnail: null,
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

/** Poll one job; when HeyGen is done the file is pulled into the workspace. */
export async function PATCH(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    const list = await jobs();
    const job = list.find((j) => j.id === id);
    if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
    if (job.file) return NextResponse.json({ job });

    requireIntegration("heygen");
    const status = await videoStatus(job.videoId);
    job.status = status.status;
    job.error = status.error;
    job.updatedAt = Date.now();

    if (status.status === "completed" && status.videoUrl) {
      try {
        job.file = await saveRemote(PROJECT, status.videoUrl, `heygen-${stamp()}`);
        if (status.thumbnailUrl) {
          job.thumbnail = await saveRemote(PROJECT, status.thumbnailUrl, `heygen-${stamp()}-thumb`).catch(() => null);
        }
      } catch (e) {
        // The render succeeded even if the download did not — say which failed.
        job.error = `rendered, but the download failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    await saveJobs(list);
    return NextResponse.json({ job, project: PROJECT });
  } catch (e) {
    return fail(e);
  }
}
