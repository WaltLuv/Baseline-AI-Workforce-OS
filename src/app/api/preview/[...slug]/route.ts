import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { contentTypeFor, safeJoin, workspaceRoot } from "@/lib/workspace";
import { safeSlug } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a file out of a workspace project so a generated app or game can be
 * previewed in place: /api/preview/<project>/<path…>
 *
 * Only the media types a preview actually needs are served, and the path can
 * never climb out of the project folder.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  if (!slug?.length) return new Response("not found", { status: 404 });

  const [project, ...rest] = slug;
  const dir = path.join(workspaceRoot(), safeSlug(project, "project"));
  const rel = rest.length ? rest.join("/") : "index.html";
  const abs = safeJoin(dir, rel);
  if (!abs || !existsSync(abs)) return new Response("not found", { status: 404 });

  const type = contentTypeFor(rel);
  if (!type) return new Response("preview not supported for this file type", { status: 415 });

  const body = await readFile(abs).catch(() => null);
  if (!body) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
      // Generated pages are untrusted: keep them from reaching back into the app.
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals allow-popups;",
    },
  });
}
