/**
 * HeyGen — avatar video render.
 *
 * Endpoints (v2 generate, v1 status) per HeyGen's API reference. Responses are
 * read defensively: HeyGen wraps payloads in `data` and has moved fields
 * between releases, so we accept both the wrapped and bare shapes and surface
 * the raw error text when neither matches.
 */

const BASE = process.env.HEYGEN_BASE_URL ?? "https://api.heygen.com";

function key(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY is not set");
  return k;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Api-Key": key(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HeyGen returns HTML on some auth failures */
  }
  if (!res.ok) {
    const message =
      (json as { message?: string; error?: { message?: string } } | null)?.message ??
      (json as { error?: { message?: string } } | null)?.error?.message ??
      text.slice(0, 300);
    throw new Error(`HeyGen ${res.status}: ${message}`);
  }
  const body = json as { data?: T; error?: { message?: string } | null };
  if (body?.error) throw new Error(`HeyGen: ${body.error.message ?? "request failed"}`);
  return (body?.data ?? (json as T)) as T;
}

export interface HeyGenAvatar {
  id: string;
  name: string;
  preview: string | null;
  kind: "avatar" | "talking_photo";
}

export interface HeyGenVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  preview: string | null;
}

export async function listAvatars(): Promise<HeyGenAvatar[]> {
  const data = await call<{
    avatars?: { avatar_id: string; avatar_name?: string; preview_image_url?: string }[];
    talking_photos?: { talking_photo_id: string; talking_photo_name?: string; preview_image_url?: string }[];
  }>(`${BASE}/v2/avatars`);

  const avatars: HeyGenAvatar[] = (data.avatars ?? []).map((a) => ({
    id: a.avatar_id,
    name: a.avatar_name || a.avatar_id,
    preview: a.preview_image_url ?? null,
    kind: "avatar" as const,
  }));
  const photos: HeyGenAvatar[] = (data.talking_photos ?? []).map((p) => ({
    id: p.talking_photo_id,
    name: p.talking_photo_name || p.talking_photo_id,
    preview: p.preview_image_url ?? null,
    kind: "talking_photo" as const,
  }));
  return [...avatars, ...photos];
}

export async function listVoices(): Promise<HeyGenVoice[]> {
  const data = await call<{
    voices?: { voice_id: string; name?: string; language?: string; gender?: string; preview_audio?: string }[];
  }>(`${BASE}/v2/voices`);
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name || v.voice_id,
    language: v.language ?? "",
    gender: v.gender ?? "",
    preview: v.preview_audio ?? null,
  }));
}

export interface GenerateInput {
  script: string;
  avatarId: string;
  voiceId: string;
  avatarKind?: "avatar" | "talking_photo";
  title?: string;
  aspect?: "16:9" | "9:16" | "1:1";
  /** HeyGen's watermarked free-tier render — no credits burned. */
  test?: boolean;
}

const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1080, height: 1080 },
};

export async function generateVideo(input: GenerateInput): Promise<string> {
  const character =
    input.avatarKind === "talking_photo"
      ? { type: "talking_photo", talking_photo_id: input.avatarId }
      : { type: "avatar", avatar_id: input.avatarId, avatar_style: "normal" };

  const data = await call<{ video_id?: string }>(`${BASE}/v2/video/generate`, {
    method: "POST",
    body: JSON.stringify({
      video_inputs: [
        {
          character,
          voice: { type: "text", input_text: input.script, voice_id: input.voiceId },
        },
      ],
      dimension: DIMENSIONS[input.aspect ?? "16:9"],
      title: input.title?.slice(0, 120) || "Baseline AI Workforce",
      test: input.test ?? false,
    }),
  });

  if (!data.video_id) throw new Error("HeyGen accepted the request but returned no video_id");
  return data.video_id;
}

export interface VideoStatus {
  status: "pending" | "processing" | "completed" | "failed" | string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  error: string | null;
}

export async function videoStatus(videoId: string): Promise<VideoStatus> {
  const data = await call<{
    status?: string;
    video_url?: string;
    thumbnail_url?: string;
    duration?: number;
    error?: { message?: string; detail?: string } | string | null;
  }>(`${BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);

  const err = data.error;
  return {
    status: data.status ?? "pending",
    videoUrl: data.video_url ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    duration: typeof data.duration === "number" ? data.duration : null,
    error: !err ? null : typeof err === "string" ? err : (err.detail ?? err.message ?? "render failed"),
  };
}
