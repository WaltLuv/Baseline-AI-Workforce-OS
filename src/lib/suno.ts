/**
 * Suno — music render.
 *
 * Suno has no first-party public API; the widely used gateways (sunoapi.org,
 * kie.ai and friends) share one shape, so the base URL is configurable and the
 * response is read defensively. Generation is a task you poll, not a
 * request/response.
 */

const BASE = (process.env.SUNO_BASE_URL ?? "https://api.sunoapi.org").replace(/\/$/, "");

function key(): string {
  const k = process.env.SUNO_API_KEY;
  if (!k) throw new Error("SUNO_API_KEY is not set");
  return k;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: { code?: number; msg?: string; data?: T } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* gateway error page */
  }
  if (!res.ok) throw new Error(`Suno ${res.status}: ${json?.msg ?? text.slice(0, 300)}`);
  if (json && typeof json.code === "number" && json.code !== 200) {
    throw new Error(`Suno: ${json.msg ?? `code ${json.code}`}`);
  }
  return (json?.data ?? (json as unknown as T)) as T;
}

export interface MusicRequest {
  /** In custom mode this is the lyrics; otherwise a plain description. */
  prompt: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  customMode?: boolean;
  model?: string;
  negativeTags?: string;
}

export async function generateMusic(req: MusicRequest): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: req.prompt,
    customMode: req.customMode ?? Boolean(req.style || req.title),
    instrumental: req.instrumental ?? false,
    model: req.model ?? process.env.SUNO_MODEL ?? "V4_5",
  };
  // In custom mode the gateway requires style and title; in simple mode it rejects them.
  if (body.customMode) {
    body.style = req.style || "cinematic";
    body.title = (req.title || "Untitled").slice(0, 80);
    if (req.negativeTags) body.negativeTags = req.negativeTags;
  }
  if (process.env.SUNO_CALLBACK_URL) body.callBackUrl = process.env.SUNO_CALLBACK_URL;

  const data = await call<{ taskId?: string; task_id?: string }>(`${BASE}/api/v1/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = data.taskId ?? data.task_id;
  if (!taskId) throw new Error("Suno accepted the request but returned no taskId");
  return taskId;
}

export interface MusicTrack {
  id: string;
  title: string;
  audioUrl: string | null;
  imageUrl: string | null;
  tags: string;
  duration: number | null;
}

export interface MusicStatus {
  status: string;
  done: boolean;
  failed: boolean;
  tracks: MusicTrack[];
  error: string | null;
}

interface RawTrack {
  id?: string;
  title?: string;
  audioUrl?: string;
  audio_url?: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  tags?: string;
  duration?: number;
}

export async function musicStatus(taskId: string): Promise<MusicStatus> {
  const data = await call<{
    status?: string;
    errorMessage?: string;
    response?: { sunoData?: RawTrack[] };
  }>(`${BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);

  const status = (data.status ?? "PENDING").toUpperCase();
  const raw = data.response?.sunoData ?? [];
  return {
    status,
    // The gateway reports SUCCESS once every track is finished; first-track
    // states still carry a playable URL, so treat "has audio" as usable.
    done: status === "SUCCESS" || raw.some((t) => t.audioUrl || t.audio_url),
    failed: status.includes("FAIL") || status.includes("ERROR"),
    error: data.errorMessage ?? null,
    tracks: raw.map((t, i) => ({
      id: t.id ?? `${taskId}-${i}`,
      title: t.title ?? "Untitled",
      audioUrl: t.audioUrl ?? t.audio_url ?? t.streamAudioUrl ?? null,
      imageUrl: t.imageUrl ?? null,
      tags: t.tags ?? "",
      duration: typeof t.duration === "number" ? t.duration : null,
    })),
  };
}
