/**
 * Bringing rendered media home.
 *
 * Anything a render service produces lives behind a URL that expires — HeyGen
 * keeps a video for a while, Suno deletes after fifteen days. So the moment a
 * job finishes we pull the file into the workspace project, and the UI plays it
 * from disk through /api/preview.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureProject } from "./workspace";
import { safeSlug } from "./store";

const MAX_BYTES = 200 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

/** Download a remote asset into a workspace project. Returns the relative path. */
export async function saveRemote(project: string, url: string, baseName: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download the finished file (${res.status})`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error(`file is larger than the ${MAX_BYTES / 1e6}MB cap`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("file is larger than the cap");

  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const fromUrl = path.extname(new URL(url).pathname);
  const ext = EXT_BY_TYPE[type] ?? (fromUrl.length <= 5 ? fromUrl : "") ?? "";

  return writeMedia(project, `${baseName}${ext}`, buf);
}

/** Write bytes we already hold (a base64 image, say) into a workspace project. */
export async function writeMedia(project: string, fileName: string, bytes: Buffer): Promise<string> {
  const dir = await ensureProject(project);
  const safe = safeSlug(path.basename(fileName, path.extname(fileName)), "render");
  const rel = path.join("renders", `${safe}${path.extname(fileName)}`);
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return rel.split(path.sep).join("/");
}

export function stamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
}
