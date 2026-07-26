import { NextResponse } from "next/server";
import path from "node:path";
import { ensureProject, listFiles, listProjects, readProjectFile, workspaceRoot } from "@/lib/workspace";
import { safeSlug } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project = url.searchParams.get("project");
  const file = url.searchParams.get("file");

  if (project && file) {
    const content = await readProjectFile(project, file);
    if (content === null) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ project, file, content });
  }

  if (project) {
    const dir = path.join(workspaceRoot(), safeSlug(project, "project"));
    return NextResponse.json({ project, root: dir, files: await listFiles(dir) });
  }

  return NextResponse.json({ root: workspaceRoot(), projects: await listProjects() });
}

export async function POST(req: Request) {
  const { project } = (await req.json().catch(() => ({}))) as { project?: string };
  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });
  const dir = await ensureProject(project);
  return NextResponse.json({ ok: true, project: path.basename(dir), root: dir });
}
