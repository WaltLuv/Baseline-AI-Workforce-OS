import { exportPack } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the whole workforce as one zip — what you hand a client. */
export async function GET() {
  try {
    const zip = await exportPack();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="workforce-pack-${stamp}.zip"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }
}
