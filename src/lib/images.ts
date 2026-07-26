/**
 * Image render for the Thumbnail studio.
 *
 * Speaks the OpenAI images shape (`POST /v1/images/generations`), which is what
 * OpenAI, Azure and most compatible gateways expose — so pointing IMAGE_BASE_URL
 * somewhere else is all it takes to switch provider.
 */

import { writeMedia, stamp } from "./media";

function endpoint(): { url: string; key: string; model: string } {
  const key = process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set IMAGE_API_KEY or OPENAI_API_KEY to render images");
  const base = (process.env.IMAGE_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    url: `${base}/images/generations`,
    key,
    model: process.env.IMAGE_MODEL ?? "gpt-image-1",
  };
}

export interface ImageRequest {
  prompt: string;
  /** 16:9 for thumbnails, square for covers. */
  size?: "1536x1024" | "1024x1024" | "1024x1536";
  quality?: "low" | "medium" | "high";
  project: string;
  name?: string;
}

export interface ImageResult {
  file: string;
  bytes: number;
  model: string;
  revisedPrompt: string | null;
}

export async function renderImage(req: ImageRequest): Promise<ImageResult> {
  const { url, key, model } = endpoint();

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: req.prompt.slice(0, 30_000),
      size: req.size ?? "1536x1024",
      quality: req.quality ?? "high",
      n: 1,
    }),
  });

  const text = await res.text();
  let json: {
    data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
    error?: { message?: string };
  } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* provider error page */
  }
  if (!res.ok) throw new Error(`Image API ${res.status}: ${json?.error?.message ?? text.slice(0, 300)}`);

  const first = json?.data?.[0];
  if (!first) throw new Error("The image endpoint returned no image");

  let bytes: Buffer;
  if (first.b64_json) {
    bytes = Buffer.from(first.b64_json, "base64");
  } else if (first.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error(`could not download the rendered image (${img.status})`);
    bytes = Buffer.from(await img.arrayBuffer());
  } else {
    throw new Error("The image endpoint returned neither b64_json nor a url");
  }

  const file = await writeMedia(req.project, `${req.name ?? "thumbnail"}-${stamp()}.png`, bytes);
  return { file, bytes: bytes.byteLength, model, revisedPrompt: first.revised_prompt ?? null };
}
